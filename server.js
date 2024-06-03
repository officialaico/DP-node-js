const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const bodyParser = require('body-parser');
const app = express();
const PORT = 3000;

app.use(bodyParser.json());

// Serve static files from the root directory
app.use(express.static(path.join(__dirname, '/')));

// Endpoint to serve the final JSON data
app.get('/data', (req, res) => {
    res.sendFile(path.join(__dirname, 'trending_music_final.json'));
});

// Endpoint to serve the trending JSON data
app.get('/trending_music.json', (req, res) => {
    res.sendFile(path.join(__dirname, 'trending_music.json'));
});

// Endpoint to serve the notes JSON data
app.get('/notes.json', (req, res) => {
    const notesPath = path.join(__dirname, 'notes.json');
    if (!fs.existsSync(notesPath)) {
        fs.writeFileSync(notesPath, JSON.stringify({ notes: [] }));
    }
    res.sendFile(notesPath);
});

// Endpoint to save a note
app.post('/save-note', (req, res) => {
    const { title, content } = req.body;
    const notesPath = path.join(__dirname, 'notes.json');
    let notesData = { notes: [] };

    if (fs.existsSync(notesPath)) {
        notesData = JSON.parse(fs.readFileSync(notesPath, 'utf8'));
    }

    const existingNote = notesData.notes.find(note => note.title === title);
    if (existingNote) {
        existingNote.content = content;
    } else {
        notesData.notes.push({ title, content });
    }

    fs.writeFileSync(notesPath, JSON.stringify(notesData, null, 2));
    res.json({ message: 'Note saved successfully' });
});

// Function to run Node.js scripts sequentially
function runScripts(scripts, res) {
    let index = 0;

    function next() {
        if (index < scripts.length) {
            const script = scripts[index];
            exec(`node ${script}`, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error executing ${script}: ${error}`);
                    return res.status(500).json({ message: `Error running ${script}` });
                }
                console.log(`Output of ${script}: ${stdout}`);
                console.error(`Error output of ${script}: ${stderr}`);
                index++;
                next();
            });
        } else {
            res.json({ message: 'All scripts executed successfully' });
        }
    }

    next();
}

// Endpoint to run the scripts
app.get('/run-script', (req, res) => {
    const scripts = [
        'scrape_1.js',
        'features_2.js',
        'distro_3.js'
    ];

    runScripts(scripts, res);
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
