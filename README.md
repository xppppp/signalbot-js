# Signal Chatbot

A lightweight Node.js bot for the Signal messenger that uses `signal-cli` to receive messages, execute local system commands, and integrate custom handler modules for extended functionality.

## Prerequisites

### 1. signal-cli
This bot is a wrapper around [signal-cli](https://github.com/signalcli/signal-cli). You must have it installed and configured on your system.

- **Installation:** Follow the [signal-cli installation guide](https://github.com/signalcli/signal-cli#installation).
- **Registration:** Ensure you have registered a phone number and that `signal-cli` is working from your command line.
  ```bash
  signal-cli -u +1234567890 receive
  ```

### 2. Node.js
- Node.js (v16+ recommended)
- npm

## Installation

1. Clone this repository:
   ```bash
   git clone <repository-url>
   cd signalbot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `config.json` file in the root directory (see [Configuration](#configuration) below).

## Configuration

The bot is configured via `config.json`. 

### Example `config.json`
```json
{
    "user": "+1234567890",
    "module": "my-custom-handler",
    "permitted": [ 
        "+1987654321", 
        "group-id-of-a-trusted-group" 
    ],
    "actions": {
        "df": "/usr/bin/df -h",
        "uptime": "/usr/bin/uptime",
        "default": "X"
    },
    "repeat": 300
}
```

### Config Fields:
- **`user`**: The phone number (in E.164 format) registered with `signal-cli`.
- **`module`**: The name of the handler module to load (e.g., `"my-custom-handler"`). The bot will look for a file named `my-custom-handler.js` in the root directory and invoke its exported `handler` function.
- **`permitted`**: An array of phone numbers or group IDs allowed to interact with the bot. If this array is empty or missing, all users are permitted.
- **`actions`**: A map of command shortcuts. 
    - If a user sends a message starting with a key in this map (e.g., `df`), the bot executes the corresponding shell command and sends the output back to the user.
- **`repeat`**: The interval (in seconds) the bot waits before checking for new messages.

## Custom Handler Modules

The bot supports dynamic handler modules for complex logic. To create one, create a JavaScript file (e.g., `my-handler.js`) in the root directory and specify its name in the `module` field of `config.json`.

### Interface
The module must export a `handler` function:

```javascript
module.exports = {
    async handler(envelope, config) {
        const message = envelope.dataMessage.message;
        
        // Your logic here...

        return {
            recipients: [envelope.source], // Array of phone numbers or group IDs
            message: 'Hello! This is a custom response.'
        };
    }
};
```

- **`envelope`**: Contains the Signal message data, including `source` (sender) and `dataMessage` (content).
- **`config`**: The bot's current configuration object.
- **Return Value**: A promise resolving to a response object `{ recipients: string[], message: string }`. If the function returns `null` or `undefined`, no response is sent.

## Running the Bot

### Basic Start
```bash
node bot.js
```

### Using Environment Variables
You can override the config file and log levels using environment variables:
```bash
CONFIG=my_config.json REPLAY=messages.json DEBUG=1 VERBOSE=1 node bot.js
```
- `CONFIG`: Path to the configuration file.
- `REPLAY`: Path to a JSON or NDJSON file containing messages to replay.
- `DEBUG`: Enable debug logging (higher numbers = more verbose).
- `VERBOSE`: Enable verbose logging (higher numbers = more verbose).

## Deployment

For production, it is recommended to use a process manager like **PM2**.

1. Install PM2: `npm install pm2 -g`
2. Start the bot: `pm2 start bot.js --name signal-bot`
3. Enable auto-start on reboot: `pm2 startup` and `pm2 save`
nal-bot`
3. Enable auto-start on reboot: `pm2 startup` and `pm2 save`
