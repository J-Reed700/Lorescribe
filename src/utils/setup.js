const fs = require('fs');
const path = require('path');
const config = require('../config');

function ensureDirectoryStructure() {
    const directories = [
        config.STORAGE.TEMP_DIRECTORY,
        config.STORAGE.TRANSCRIPTS_DIRECTORY,
        config.STORAGE.SUMMARIES_DIRECTORY
    ];

    directories.forEach(dir => {
        const fullPath = path.join(process.cwd(), dir);
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
        }
    });
}

module.exports = {
    ensureDirectoryStructure
}; 