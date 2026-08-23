/**
 * Generic example handler module.
 *
 * This module is loaded dynamically by bot.js: set "module": "localhandler"
 * in config.json and it will be imported and its exported `handler`
 * function invoked for every permitted message.
 */

module.exports = {
    /**
     * @param {Object} envelope - The Signal message envelope, including
     *   `source` (sender) and `dataMessage` (message content).
     * @param {Object} config - The bot's current configuration object.
     * @returns {Promise<Array<{recipients: string[], message: string}>|null>}
     *   An array of response objects to send, or null/undefined for none.
     */
    async handler(envelope, config) {
        const message = envelope.dataMessage.message;
        console.log(`Example handler processing: ${message}`);

        // Custom logic goes here. For example, you could check for
        // specific keywords, query a database, or call an external API.

        return [
            {
                recipients: [envelope.source], // Send the response back to the sender
                message: `You said: "${message}". This is a response from the generic example handler!`
            }
        ];
    }
};
