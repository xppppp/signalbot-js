const { readFile } = require('node:fs/promises');
const { exec } = require('node:child_process');
const { promisify } = require('node:util');
const execPromise = promisify(exec);

const debug = (level, message, currentDebugLevel) => {
    if (currentDebugLevel > level) console.log(message);
};

const log = (level, message, currentVerboseLevel) => {
    if (currentVerboseLevel > level) console.log(message);
};

async function readConfig(configPath, onConfigLoaded, verboseLevel) {
    log(3, `config: reading ${configPath}...`, verboseLevel);
    try {
        const data = await readFile(configPath, 'utf8');
        const config = JSON.parse(data);
        log(3, `config: success ${JSON.stringify(config)}`, verboseLevel);

        if (config.module) {
            log(3, `config: loading ${config.module}...`, verboseLevel);
            try {
                // Dynamic import allows loading both ESM and CommonJS modules asynchronously
                const modulePath = `./${config.module}.js`;
                const imported = await import(modulePath);
                
                // Support both 'export default' (ESM) and 'module.exports' (CJS)
                config.support = imported.default || imported;
                log(3, `config: successfully loaded ${config.module}`, verboseLevel);
            } catch (err) {
                log(1, `config: failed to load module ${config.module}: ${err.message}`, verboseLevel);
                config.support = null;
            }
        }
        onConfigLoaded(config);
    } catch (err) {
        console.error(`Error reading config ${configPath}:`, err);
        throw err;
    }
}

async function getMessages(config, onMessageReceived, onError, verboseLevel) {
    const replayPath = config.replay || process.env.REPLAY;
    if (replayPath) {
        log(2, `config/env replay: reading ${replayPath}...`, verboseLevel);
        try {
            const data = await readFile(replayPath, 'utf8');
            let messages = [];
            const trimmed = data.trim();
            if (trimmed.startsWith('[')) {
                messages = JSON.parse(trimmed);
            } else {
                // Support NDJSON (one JSON object per line)
                messages = trimmed.split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0)
                    .map(line => JSON.parse(line));
            }

            log(2, `config/env replay: replaying ${messages.length} messages...`, verboseLevel);
            for (const msg of messages) {
                log(4, `replay message <${JSON.stringify(msg)}>`, verboseLevel);
                try {
                    onMessageReceived(config, msg);
                } catch (msgErr) {
                    onError(msgErr);
                }
            }
        } catch (err) {
            log(1, `config/env replay: failed to replay from ${replayPath}: ${err.message}`, verboseLevel);
            onError(err);
        } finally {
            // Clear the replay config and env so we don't replay again on subsequent loops
            config.replay = null;
            if (process.env.REPLAY) {
                delete process.env.REPLAY;
            }
        }
    }

    log(2, 'Retrieving messages', verboseLevel);
    try {
        const { stdout, stderr } = await execPromise(`signal-cli -o json -u ${config.user} receive`);
        
        if (stderr) {
            log(2, `stderr: ${stderr}`, verboseLevel);
        }

        if (stdout) {
            log(3, `Received <${stdout}>`, verboseLevel);
            
            const jsonStrings = stdout
                .trim()
                .split(/}\s*{/)
                .map((str, index, array) => {
                    let processed = str;
                    if (index > 0 && !processed.startsWith('{')) processed = '{' + processed;
                    if (index < array.length - 1 && !processed.endsWith('}')) processed = processed + '}';
                    return processed;
                });

            for (const jsonStr of jsonStrings) {
                if (!jsonStr) continue;
                log(4, `handle message <${jsonStr}>`, verboseLevel);
                try {
                    onMessageReceived(config, JSON.parse(jsonStr));
                } catch (parseErr) {
                    onError(parseErr);
                }
            }
        } else {
            log(3, 'No messages', verboseLevel);
        }
    } catch (err) {
        onError(err);
    }
}

async function handleMessage(config, envelope, verboseLevel) {
    const message = envelope.dataMessage.message;
    log(3, `Handling message ${message}`, verboseLevel);
    
    const tokens = message.split(' ');
    const messageGroupId = envelope.dataMessage.groupInfo ? envelope.dataMessage.groupInfo.groupId : '';
    
    const actionKey = tokens[0] + (tokens[1] || '');
    if (config.actions && tokens.length > 1 && config.actions[actionKey]) {
        const cmd = config.actions[actionKey];
        log(3, `Executing ${cmd}`, verboseLevel);
        
        const fullCmd = `${cmd} | signal-cli send --message-from-stdin ${envelope.source}`;
        try {
            const { stdout, stderr } = await execPromise(`bash -c "${fullCmd.replace(/"/g, '"')}"`);
            if (stderr) log(2, `dispatch stderr: ${stderr}`, verboseLevel);
            if (stdout) log(2, `dispatch stdout: ${stdout}`, verboseLevel);
        } catch (err) {
            console.error(`Execution error for ${fullCmd}:`, err);
        }
    } else if (config.actions['default'] && config.support && config.support.handler) {
        log(3, 'Dispatching to support handler', verboseLevel);
        
        try {
            // The handler now returns a Response Object: { recipients: [], message: "" }
            const response = await config.support.handler(envelope, config);
            
            if (response && response.recipients && response.message) {
                for (const recipient of response.recipients) {
                    const target = messageGroupId ? `-g ${messageGroupId}` : recipient;
                    const fullCmd = `signal-cli send --message-from-stdin ${target}`;
                    
                    try {
                        const { exec: spawnExec } = require('child_process');
                        const child = spawnExec(`/bin/bash -c "${fullCmd}"`);
                        
                        child.stdin.write(response.message);
                        child.stdin.end();
                        
                        child.stdout.on('data', (data) => log(2, `send to ${recipient} stdout: ${data}`, verboseLevel));
                        child.stderr.on('data', (data) => log(2, `send to ${recipient} stderr: ${data}`, verboseLevel));
                    } catch (err) {
                        log(1, `Error piping input to ${fullCmd}: ${err}`, verboseLevel);
                    }
                }
            } else {
                log(3, 'Support handler returned no valid response object', verboseLevel);
            }
        } catch (err) {
            log(1, `Error in support handler: ${err.message}`, verboseLevel);
        }
    } else {
        log(3, `No default handler for ${message}`, verboseLevel);
    }
}

function dispatchAction(config, messageJson, verboseLevel) {
    if (messageJson.envelope && messageJson.envelope.source && messageJson.envelope.dataMessage && messageJson.envelope.dataMessage.message) {
        const source = messageJson.envelope.source;
        const groupInfo = messageJson.envelope.dataMessage.groupInfo;
        const groupId = groupInfo ? groupInfo.groupId : null;

        const isPermitted = !config.permitted || 
                            config.permitted.includes(source) || 
                            (groupId && config.permitted.includes(groupId));

        if (isPermitted) {
            log(4, `${source} is permitted`, verboseLevel);
            handleMessage(config, messageJson.envelope, verboseLevel);
        } else {
            log(3, `${source} is not permitted`, verboseLevel);
        }
    } else {
        log(3, 'Message has nothing to handle', verboseLevel);
    }
}

function handleError(err) {
    console.error('Bot Error:', err);
}

async function runBot(configPath, debugLevel, verboseLevel) {
    const onConfigLoaded = async (config) => {
        const loop = async () => {
            log(2, 'Next sequence', verboseLevel);
            if (config.user) {
                await getMessages(config, (cfg, msg) => dispatchAction(cfg, msg, verboseLevel), handleError, verboseLevel);
            } else {
                log(1, 'signal user not configured', verboseLevel);
            }

            if (config.repeat > 0) {
                setTimeout(loop, config.repeat * 1000);
            }
        };
        await loop();
    };

    await readConfig(configPath, onConfigLoaded, verboseLevel);
}

if (require.main === module) {
    runBot(
        process.env.CONFIG || 'config.json',
        parseInt(process.env.DEBUG || '0', 10),
        parseInt(process.env.VERBOSE || '0', 10)
    );
}

module.exports = {
    readConfig,
    getMessages,
    handleMessage,
    dispatchAction,
    runBot
};
