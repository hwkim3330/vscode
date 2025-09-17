// KETI Code - Client-side JavaScript
// Pure vanilla JS, no frameworks

let terminalId = null;
let ws = null;

// File operations
function newFile() {
    document.getElementById('editor').value = '';
    document.querySelector('.tab.active').textContent = 'untitled.txt';
}

function openFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = e => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = e => {
            document.getElementById('editor').value = e.target.result;
            document.querySelector('.tab.active').textContent = file.name;
        };
        reader.readAsText(file);
    };
    input.click();
}

function saveFile() {
    const content = document.getElementById('editor').value;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = document.querySelector('.tab.active').textContent;
    a.click();
}

// Terminal operations
async function toggleTerminal() {
    const terminal = document.getElementById('terminal');

    if (terminal.style.display === 'none') {
        terminal.style.display = 'block';

        if (!terminalId) {
            // Create terminal session
            const response = await fetch('/api/terminal/create', { method: 'POST' });
            const data = await response.json();
            terminalId = data.id;

            // Connect WebSocket
            connectTerminal(terminalId);
        }
    } else {
        terminal.style.display = 'none';
    }
}

function connectTerminal(id) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws/terminal/${id}`);

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'output') {
            appendToTerminal(data.data);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function appendToTerminal(text) {
    const output = document.getElementById('terminal-output');
    output.textContent += text;
    output.parentElement.scrollTop = output.parentElement.scrollHeight;
}

// Terminal input handler
document.addEventListener('DOMContentLoaded', () => {
    const terminalInput = document.getElementById('terminal-input');

    terminalInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const command = terminalInput.value;

            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'input',
                    data: command + '\n'
                }));
            }

            terminalInput.value = '';
        }
    });

    // AI input handler
    const aiInput = document.getElementById('ai-input');

    aiInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            const prompt = aiInput.value.trim();
            if (!prompt) return;

            // Add user message
            addAIMessage('You', prompt);
            aiInput.value = '';

            // Get AI response
            try {
                const response = await fetch('/api/ai/complete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt })
                });

                const data = await response.json();
                if (data.content) {
                    addAIMessage('AI', data.content);
                } else if (data.error) {
                    addAIMessage('System', 'Error: ' + data.error);
                }
            } catch (err) {
                addAIMessage('System', 'Failed to connect to AI');
            }
        }
    });

    // Load file tree
    loadFileTree();
});

// AI operations
function toggleAI() {
    const panel = document.getElementById('ai-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function addAIMessage(sender, message) {
    const chat = document.getElementById('ai-chat');
    const msgDiv = document.createElement('div');
    msgDiv.style.marginBottom = '8px';
    msgDiv.innerHTML = `<strong>${sender}:</strong> ${message}`;
    chat.appendChild(msgDiv);
    chat.scrollTop = chat.scrollHeight;
}

// File tree
async function loadFileTree() {
    try {
        const response = await fetch('/api/files');
        const files = await response.json();

        const tree = document.getElementById('file-tree');
        tree.innerHTML = '';

        files.forEach(file => {
            const item = document.createElement('div');
            item.className = 'file-item';
            item.textContent = (file.type === 'dir' ? '📁 ' : '📄 ') + file.name;
            item.onclick = () => {
                if (file.type === 'file') {
                    loadFile(file.path);
                }
            };
            tree.appendChild(item);
        });
    } catch (err) {
        console.error('Failed to load file tree:', err);
    }
}

async function loadFile(path) {
    try {
        const response = await fetch('/api/file?path=' + encodeURIComponent(path));
        const data = await response.json();

        if (data.content !== undefined) {
            document.getElementById('editor').value = data.content;
            document.querySelector('.tab.active').textContent = path.split('/').pop();
        }
    } catch (err) {
        console.error('Failed to load file:', err);
    }
}

// Editor features
const editor = document.getElementById('editor');

// Tab key handling
editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        editor.value = editor.value.substring(0, start) + '    ' + editor.value.substring(end);
        editor.selectionStart = editor.selectionEnd = start + 4;
    }

    // Ctrl+S to save
    if (e.key === 's' && e.ctrlKey) {
        e.preventDefault();
        saveFile();
    }
});

console.log('KETI Code initialized');