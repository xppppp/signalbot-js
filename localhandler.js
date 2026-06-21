/**
 * Generic Example Handler Module
 * 
 * This module is loaded dynamically by bot.js.
 * It must export a 'handler' function.
 */

module.exports = {
    /**
     * The main entry point for processing messages.
     * 
     * @param {Object} envelope - The Signal message envelope containing sender and message data.
     * @param {Object} config - The bot's configuration object.
     * @returns {Promise<Object>} A response object containing recipients and the message body.
     * 
     * Example return value:
     * {
     *   recipients: ['+1234567890', 'group-id-123'],
     *   message: 'Hello from the custom handler!'
     * }
     */
    async handler(envelope, config) {
        const message = envelope.dataMessage.message;
        console.log(`Example handler processing: ${message}`);

        // Custom logic goes here. 
        // For example, you could check for specific keywords, 
        // query a database, or call an external API.

        // Return a structured response object
        return {
            recipients: [envelope.source], // Send response back to the original sender
            message: `You said: "${message}". This is a response from the generic example handler!`
        };
    }
};
