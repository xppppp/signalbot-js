(async (cfname, debugLevel, verbose) => {
    const { readFile } = await import('node:fs');
    const { exec } = await import('node:child_process');
    const debug = (_l, _m) => {
	if (debugLevel > _l) console.log(_m);
    };
    const log = (_l, _m) => {
	if (verbose > _l) console.log(_m);
    };
    const readConfig = (_cf, _s) => {
	log(3, `config: reading ${_cf}...`);
	readFile(_cf, (err, data) => {
	    if (err) {
		throw err;
	    } else {
		let config = JSON.parse(data);
		log(3, `config: success ${JSON.stringify(config)}`);
		if (config.module) {
		    log(3, `config: loading ${config.module}`);
		    config.support = require('./'+config.module);
		}
		_s(config);
	    }
	});
    };
    const getMessage = (_c, _s, _e) => {
	log(2, 'Retrieving messages');
	exec(`signal-cli -o json -u ${_c.user} receive`, (e, out, err) => {
	    if (e) {
		_e(e);
	    } else {
		if (err.length) {
		    log(2, `stderr: ${err}`);
		}
		if (out.length) {
		    log(3, `Received <${out}>`);
		    /*
		     * multiple messages are sent as concatenated JSON
		     * objects.
		     */
		    out.toString().
			replace(/\n/g,'').
			split('}{').
			forEach((msg) => {
			    if (msg.match('^[^\{]')) {
				msg = '{'+msg;
			    }
			    if (msg.match('[^\}]$')) {
				msg = msg + '}'
			    }
			    log(4, `handle message <${msg}>`);
			    try {
				_s(_c, JSON.parse(msg));
			    }
			    catch (mperr) {
				_e(mperr);
			    }
			});
		} else {
		    log(3, 'No messages');
		}
	    }
	});
    };
    const handleMessage = (_c, _e) => {
	log(3, `Handling message ${_e.dataMessage.message}`);
	let tokens = _e.dataMessage.message.split(' ');
	if (_c.actions && tokens.length > 1 &&
	    _c.actions[tokens[0]+tokens[1]]) {
	    let cmd = _c.actions[tokens[0]+tokens[1]];
	    log(3, `Executing ${cmd}`);
	    let fullcmd = `${cmd}|signal-cli send --message-from-stdin ${_e.source}`;
	    exec(`bash -c "${fullcmd}"`, (e, out, err) => {
		if (e) {
		    throw(e);
		} else {
		    if (err.length) {
			log(2, `dispatch stderr: ${err}`);
		    }
		    if (out.length) {
			log(2, `dispatch stdout: ${out}`);
		    }
		}
	    });
	} else {
	    if (_c.actions['default'] && _c.support) {
		_c.support.handler(_e);
	    } else {
		log(3, `No default handler for ${_e.dataMessage.message}`);
	    }
	}
    };
    const dispatchAction = (_c, _m) => {
	if (_m.envelope && _m.envelope.source && _m.envelope.dataMessage &&
	    _m.envelope.dataMessage.message) {
	    if (!_c.permitted || _c.permitted.includes(_m.envelope.source)) {
		handleMessage(_c, _m.envelope);
	    }
	} else {
	    throw(new Error('Malformed signal json'));
	}
    };
    const handleError = (_err) => {
	console.error(_err);
    };
    const oneTime = (_c) => {
	log(2, 'Next sequence');
	if (_c.user) {
	    getMessage(_c, dispatchAction, handleError);
	} else {
	    log(1, 'signal user not configured');
	}
	if (_c.repeat > 0) {
	    setTimeout(() => { oneTime(_c); }, _c.repeat * 1000);
	}
    };
    readConfig(cfname, oneTime);
})(process.env.CONFIG || 'config.json',
   process.env.DEBUG || 0,
   process.env.VERBOSE || 0);
