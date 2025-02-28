#!/usr/bin/env python3
import os
import re
import json
import argparse
import subprocess
import difflib
from flask import Flask, request, render_template_string, send_from_directory, jsonify
import openai

# Instantiate an OpenAI client with your API key.
API_KEY = os.getenv("OPENAI_API_KEY")
client = openai.Client(api_key=API_KEY)

# Global variables for managing multiple files, coding contexts, and debugging.
ACTIVE_FILES = []
CODING_CONTEXTS = []
DEBUG = False

# HTML template for the chat interface with tabs.
HTML_TEMPLATE = """
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Project Manager Chat</title>
    <style>
      body { 
        font-family: sans-serif; 
        margin: 0; 
        padding: 0; 
        background-color: #2e2e2e; 
        color: #f0f0f0;
        height: 100vh;
        overflow: hidden;
      }
      #container {
        display: flex;
        height: 100%;
        width: 100%;
      }
      /* Left Column - Project Browser */
      #projectBrowser {
        width: 20%;
        min-width: 200px;
        border-right: 1px solid #444;
        padding: 10px;
        box-sizing: border-box;
        overflow-y: auto;
      }
      #projectBrowser h2 {
        color: #fff;
      }
      /* Middle Column - Active Coding Contexts, Tabs, Source Code Editor and Chat */
      #mainContent {
        width: 60%;
        display: flex;
        flex-direction: column;
        padding: 10px;
        box-sizing: border-box;
        overflow: hidden;
      }
      /* Active Coding Contexts */
      #activeCodingContextsContainer {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        margin-bottom: 10px;
      }
      #activeCodingContexts {
        display: flex;
        flex-wrap: wrap;
      }
      .badge {
        display: inline-block;
        padding: 5px 10px;
        margin: 2px;
        background-color: #4CAF50;
        border-radius: 12px;
        font-size: 12px;
        cursor: pointer;
      }
      /* Tabs */
      #tabs {
        display: flex;
        border-bottom: 1px solid #444;
        margin-bottom: 10px;
      }
      .tab {
        padding: 10px;
        cursor: pointer;
        background-color: #3c3c3c;
        margin-right: 2px;
        border-top-left-radius: 4px;
        border-top-right-radius: 4px;
      }
      .tab.active {
        background-color: #1e1e1e;
        border-bottom: 1px solid #1e1e1e;
      }
      .close-btn {
        margin-left: 5px;
        color: #f44336;
        font-weight: bold;
        cursor: pointer;
      }
      /* Source Code Editor */
      #sourceCodeContainer {
        flex: 2;
        display: flex;
        flex-direction: column;
        margin-bottom: 10px;
      }
      #sourceCodeContainer h2 {
        color: #fff;
        margin-bottom: 5px;
      }
      #sourceCode {
        flex: 1;
        background-color: #1e1e1e;
        color: #d4d4d4;
        font-family: monospace;
        font-size: 14px;
        padding: 10px;
        border: 1px solid #444;
        resize: none;
        border-radius: 4px;
        overflow: auto;
      }
      #chatContainer {
        display: flex;
        flex-direction: column;
        max-height: 200px;
      }
      #chatBox {
        flex: 1;
        border: 1px solid #444;
        padding: 10px;
        overflow-y: auto;
        background-color: #1e1e1e;
        border-radius: 4px;
        max-height: 150px;
      }
      .message { margin-bottom: 10px; }
      .User { color: #4FC3F7; }
      .Assistant { color: #81C784; }
      /* CSS spinner */
      #throbber {
        display: none;
        width: 40px;
        height: 40px;
        border: 4px solid #ccc;
        border-top: 4px solid #333;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 20px auto;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      /* Styles for commit summaries */
      #commitSummariesContainer {
        width: 20%;
        min-width: 200px;
        border-left: 1px solid #444;
        padding: 10px;
        box-sizing: border-box;
        background-color: #1e1e1e;
        overflow-y: auto;
      }
      #commitSummariesContainer h2 {
        color: #fff;
      }
      #commitSummaries {
        height: 100%;
        overflow-y: auto;
      }
      .commit-summary {
        margin-bottom: 10px;
        padding: 5px;
        border-bottom: 1px solid #555;
      }
      /* Dark mode adjustments */
      textarea, input[type="submit"] {
        background-color: #3c3c3c;
        color: #f0f0f0;
        border: 1px solid #555;
        border-radius: 4px;
      }
      textarea::placeholder {
        color: #bbb;
      }
      input[type="submit"] {
        padding: 10px;
        cursor: pointer;
        display: none;
      }
      form {
        display: flex;
        flex-direction: column;
      }
      /* Responsive adjustments */
      @media (max-width: 1200px) {
        #projectBrowser, #commitSummariesContainer {
          width: 25%;
        }
        #mainContent {
          width: 50%;
        }
      }
      @media (max-width: 800px) {
        #container {
          flex-direction: column;
        }
        #projectBrowser, #commitSummariesContainer {
          width: 100%;
          min-width: unset;
          height: 150px;
        }
        #mainContent {
          width: 100%;
          flex: 1;
        }
      }
      /* Styles for project browser tree */
      .directory, .file {
        margin-left: 20px;
      }
      .directory > span {
        cursor: pointer;
        font-weight: bold;
      }
      .hidden {
        display: none;
      }
    </style>
    <!-- Load Marked for Markdown parsing -->
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script>
      let activeFile = null;
      let openFiles = {};

      // Render Markdown while escaping any raw HTML.
      function renderMarkdown(text) {
        const renderer = new marked.Renderer();
        renderer.html = function(html) {
          return String(html).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        };
        return marked.parse(text, {
          renderer: renderer,
          headerIds: false,
          mangle: false
        });
      }

      // Function to load project structure and set up event listeners for files
      async function loadProjectStructure() {
        try {
          const response = await fetch('/project_structure');
          if (response.ok) {
            const data = await response.json();
            const projectBrowser = document.getElementById('projectBrowser');
            projectBrowser.innerHTML = '<h2>Project Browser</h2>';
            const treeContainer = document.createElement('div');
            createProjectTree(data, treeContainer);
            projectBrowser.appendChild(treeContainer);
          }
        } catch (e) {
          console.error('Error loading project structure:', e);
        }
      }

      // Function to create the project tree
      function createProjectTree(structure, parentElement, currentPath = '') {
        structure.forEach(item => {
          const itemDiv = document.createElement('div');
          if (item.type === 'directory') {
            const dirSpan = document.createElement('span');
            dirSpan.textContent = item.name;
            dirSpan.addEventListener('click', () => {
              childContainer.classList.toggle('hidden');
            });
            itemDiv.appendChild(dirSpan);
            const childContainer = document.createElement('div');
            childContainer.className = 'directory hidden';
            // Recursively create tree with updated path
            createProjectTree(item.children, childContainer, currentPath + item.name + '/');
            itemDiv.appendChild(childContainer);
          } else {
            const fileSpan = document.createElement('span');
            fileSpan.textContent = item.name;
            fileSpan.className = 'file';
            const fullPath = currentPath + item.name;
            fileSpan.addEventListener('click', () => {
              openFileInTab(fullPath);
            });
            itemDiv.appendChild(fileSpan);
          }
          parentElement.appendChild(itemDiv);
        });
      }

      // Function to open a file in a new tab
      async function openFileInTab(filename) {
        if (openFiles[filename]) {
          switchToTab(filename);
          return;
        }

        try {
          const response = await fetch(`/source?file=${encodeURIComponent(filename)}`);
          if (response.ok) {
            const data = await response.json();
            // Create a new tab
            const tabs = document.getElementById('tabs');
            const tab = document.createElement('div');
            tab.className = 'tab active';
            tab.id = `tab-${filename}`;
            tab.textContent = filename;
            const closeBtn = document.createElement('span');
            closeBtn.className = 'close-btn';
            closeBtn.textContent = '×';
            closeBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              closeTab(filename);
            });
            tab.appendChild(closeBtn);
            // Add event listener to switch tab on click
            tab.addEventListener('click', () => {
              switchToTab(filename);
            });
            // Deactivate other tabs
            Array.from(tabs.getElementsByClassName('tab')).forEach(t => {
              t.classList.remove('active');
            });
            tabs.appendChild(tab);
            // Load content
            document.getElementById('sourceCode').value = data.content;
            activeFile = filename;
            openFiles[filename] = true;
            // Load transcript
            await loadTranscript(filename);
          }
        } catch (e) {
          console.error('Error opening file:', e);
        }
      }

      // Function to switch to an existing tab
      async function switchToTab(filename) {
        activeFile = filename;
        // Activate the selected tab
        const tabs = document.getElementById('tabs');
        Array.from(tabs.getElementsByClassName('tab')).forEach(t => {
          if (t.id === `tab-${filename}`) {
            t.classList.add('active');
          } else {
            t.classList.remove('active');
          }
        });
        // Load source code
        try {
          const response = await fetch(`/source?file=${encodeURIComponent(filename)}`);
          if (response.ok) {
            const data = await response.json();
            document.getElementById('sourceCode').value = data.content;
            // Load transcript
            await loadTranscript(filename);
          }
        } catch (e) {
          console.error('Error switching tabs:', e);
        }
      }

      // Function to close a tab
      function closeTab(filename) {
        const tab = document.getElementById(`tab-${filename}`);
        if (tab) {
          tab.parentNode.removeChild(tab);
          delete openFiles[filename];
          // If the closed tab was active, switch to another tab
          if (activeFile === filename) {
            const remainingTabs = document.getElementById('tabs').getElementsByClassName('tab');
            if (remainingTabs.length > 0) {
              const newActiveFilename = remainingTabs[remainingTabs.length - 1].id.replace('tab-', '');
              switchToTab(newActiveFilename);
            } else {
              activeFile = null;
              document.getElementById('sourceCode').value = '';
              document.getElementById('chatBox').innerHTML = '';
              document.getElementById('commitSummaries').innerHTML = '';
              document.getElementById('activeCodingContexts').innerHTML = '';
            }
          }
        }
      }

      // Function to load source code into the editor
      async function loadSourceCode(filename) {
        try {
          const response = await fetch(`/source?file=${encodeURIComponent(filename)}`);
          if (response.ok) {
            const data = await response.json();
            document.getElementById('sourceCode').value = data.content;
          }
        } catch (e) {
          console.error('Error loading source code:', e);
        }
      }

      // Function to update source code from the editor
      async function updateSourceCode() {
        if (!activeFile) return;
        const updatedContent = document.getElementById('sourceCode').value;
        try {
          const response = await fetch('/update_source', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: activeFile, content: updatedContent })
          });
          if (response.ok) {
            console.log('Source code updated successfully.');
          } else {
            console.error('Failed to update source code.');
          }
        } catch (e) {
          console.error('Error updating source code:', e);
        }
      }

      // Append a message to chatBox; content is rendered as Markdown.
      function appendMessage(role, content) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message';
        msgDiv.innerHTML = '<strong class="' + role + '">' + role + ':</strong><div>' + renderMarkdown(content) + '</div>';
        chatBox.appendChild(msgDiv);
      }

      // Append a commit summary to commitSummaries
      function appendCommitSummary(summary) {
        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'commit-summary';
        summaryDiv.textContent = summary;
        commitSummaries.appendChild(summaryDiv);
      }

      // Append a coding context badge to activeCodingContexts
      function appendCodingContext(context) {
        if (!context || !context.name) return;
        const badgeSpan = document.createElement('span');
        badgeSpan.className = 'badge';
        badgeSpan.textContent = context.name;
        if (context.content) {
          badgeSpan.title = context.content; // Tooltip with full content
        }
        activeCodingContexts.appendChild(badgeSpan);
      }

      // Scroll to the bottom of an element.
      function scrollToBottom(element) {
        element.scrollTop = element.scrollHeight;
      }

      // Function to load and display the project structure
      async function loadProjectStructure() {
        try {
          const response = await fetch('/project_structure');
          if (response.ok) {
            const data = await response.json();
            const projectBrowser = document.getElementById('projectBrowser');
            projectBrowser.innerHTML = '<h2>Project Browser</h2>';
            const treeContainer = document.createElement('div');
            createProjectTree(data, treeContainer);
            projectBrowser.appendChild(treeContainer);
          }
        } catch (e) {
          console.error('Error loading project structure:', e);
        }
      }

      // Function to load the existing conversation transcript for a specific file from the server.
      async function loadTranscript(filename) {
        try {
          const response = await fetch(`/transcript?file=${encodeURIComponent(filename)}`);
          if (response.ok) {
            const data = await response.json();
            document.getElementById('chatBox').innerHTML = '';
            document.getElementById('commitSummaries').innerHTML = '';
            document.getElementById('activeCodingContexts').innerHTML = '';
            data.forEach(msg => {
              if (msg.role.toLowerCase() === 'assistant') {
                const professionalMessage = extractProfessionalMessage(msg.content);
                appendMessage(msg.role, professionalMessage);
                const commit = extractCommit_summary(msg.content);
                if (commit) {
                  appendCommitSummary(commit);
                }
              } else {
                appendMessage(msg.role, msg.content);
              }
            });
            scrollToBottom(chatBox);
            scrollToBottom(commitSummaries);
          }
          // Load coding contexts
          const contextsResponse = await fetch('/coding_contexts');
          if (contextsResponse.ok) {
            const contextsData = await contextsResponse.json();
            activeCodingContexts.innerHTML = ""; // Prevent duplication
            if (contextsData && contextsData.length > 0) {
              contextsData.forEach(ctx => {
                appendCodingContext(ctx);
              });
              scrollToBottom(activeCodingContexts);
            }
          }
        } catch (e) {
          console.error('Error loading transcript or coding contexts:', e);
        }
      }

      // Function to extract commit summary
      function extract_commit_summary(text) {
        const regex = /^Commit Summary:\s*(.+)/m;
        const match = text.match(regex);
        return match ? match[1].trim() : null;
      }

      // Function to extract the professional message before the code block.
      function extract_professional_message(content) {
        const regex = /^(.*?)```/s;
        const match = content.match(regex);
        return match ? match[1].trim() : content.trim();
      }

      // Function to extract code from assistant response
      function extract_code_from_response(content) {
        const lines = content.splitlines();
        let in_code_block = false;
        let code_lines = [];
        for (let line of lines) {
          let stripped = line.trim();
          if (!in_code_block) {
            if (stripped.startsWith("```")) {
              in_code_block = true;
            }
            continue;
          } else {
            if (stripped === "```") {
              break;
            }
            code_lines.push(line);
          }
        }
        return code_lines.join("\\n").trim();
      }

      // Function to extract commit summary from assistant response
      function extract_commit_summary_from_response(content) {
        const regex = /^Commit Summary:\s*(.+)/m;
        const match = content.match(regex);
        return match ? match[1].trim() : "";
      }

      // Listen for Ctrl+Enter to submit the form.
      function setupEventListeners() {
        const promptInput = document.getElementById("promptInput");
        const chatForm = document.getElementById("chatForm");
        const throbber = document.getElementById("throbber");
        const chatBox = document.getElementById("chatBox");
        const commitSummaries = document.getElementById("commitSummaries");
        const activeCodingContexts = document.getElementById("activeCodingContexts");

        promptInput.addEventListener("keydown", function(e) {
          if (e.ctrlKey && e.key === "Enter") {
            e.preventDefault();
            chatForm.dispatchEvent(new Event("submit", {cancelable: true}));
          }
        });

        chatForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!activeFile) return;
          const prompt = promptInput.value.trim();
          if (!prompt) return;
          appendMessage("User", prompt);
          scrollToBottom(chatBox);
          promptInput.value = "";
          throbber.style.display = "block";

          try {
            const response = await fetch("/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ prompt: prompt, file: activeFile })
            });
            if (response.ok) {
              const data = await response.json();
              document.getElementById('chatBox').innerHTML = '';
              document.getElementById('commitSummaries').innerHTML = '';
              document.getElementById('activeCodingContexts').innerHTML = '';
              data.forEach(msg => {
                if (msg.role.toLowerCase() === 'assistant') {
                  const professionalMessage = extract_professional_message(msg.content);
                  appendMessage(msg.role, professionalMessage);
                  const commit = extract_commit_summary(msg.content);
                  if (commit) {
                    appendCommitSummary(commit);
                  }
                } else {
                  appendMessage(msg.role, msg.content);
                }
              });
              scrollToBottom(chatBox);
              scrollToBottom(commitSummaries);
              // Reload the source code after AI updates
              await loadSourceCode(activeFile);
              // Reload coding contexts
              await loadCodingContexts();
              // Reload project structure
              await loadProjectStructure();
            } else {
              console.error("Server error:", response.statusText);
            }
          } catch (error) {
            console.error("Fetch error:", error);
          }
          throbber.style.display = "none";
        });
      }

      // Function to load coding contexts
      async function loadCodingContexts() {
        try {
          const response = await fetch('/coding_contexts');
          if (response.ok) {
            const data = await response.json();
            activeCodingContexts.innerHTML = ""; // Prevent duplication
            if (data && data.length > 0) {
              data.forEach(ctx => {
                appendCodingContext(ctx);
              });
              scrollToBottom(activeCodingContexts);
            }
          }
        } catch (e) {
          console.error('Error loading coding contexts:', e);
        }
      }

      // On startup, load the project structure and set up event listeners.
      window.onload = function() {
        loadProjectStructure();
        setupEventListeners();
      };
    </script>
  </head>
  <body>
    <div id="container">
      <!-- Left Column - Project Browser -->
      <div id="projectBrowser">
        <h2>Project Browser</h2>
        <!-- Project structure will be loaded here dynamically -->
      </div>
      <!-- Middle Column - Active Coding Contexts, Tabs, Source Code Editor and Chat -->
      <div id="mainContent">
        <div id="activeCodingContextsContainer">
          <div id="activeCodingContexts">
            <!-- Coding contexts will be loaded here as badges -->
          </div>
        </div>
        <div id="tabs">
          <!-- Tabs will be dynamically added here -->
        </div>
        <div id="sourceCodeContainer">
          <h2>Source Code Editor</h2>
          <textarea id="sourceCode" readonly></textarea>
          <!-- Optional: Add a button to manually update source code if editing is allowed -->
          <!-- <button onclick="updateSourceCode()">Update Source Code</button> -->
        </div>
        <div id="chatContainer">
          <div id="chatBox">
            <!-- Existing conversation will be loaded here -->
          </div>
          <div id="throbber"></div>
          <form id="chatForm">
            <textarea id="promptInput" rows="3" placeholder="Enter your prompt here..."></textarea><br>
            <input type="submit" value="Submit">
          </form>
        </div>
      </div>
      <!-- Right Column - Commit Summaries -->
      <div id="commitSummariesContainer">
        <h2>Commit Summaries</h2>
        <div id="commitSummaries">
          <!-- Commit summaries will be loaded here -->
        </div>
      </div>
    </div>
  </body>
</html>
"""

# In-memory conversation histories mapped by filename.
chat_histories = {}

def transcript_filename(file_name):
    """Return the transcript filename based on the provided filename's basename."""
    base, _ = os.path.splitext(file_name)
    return f"{base}-transcript.json"

def load_transcript_from_disk(file_name):
    """Load transcript from disk into chat_histories for the given file (if it exists)."""
    fname = transcript_filename(file_name)
    if os.path.exists(fname):
        try:
            with open(fname, "r") as f:
                data = json.load(f)
                if isinstance(data, list):
                    chat_histories[file_name] = data
                    return data
        except Exception:
            pass
    chat_histories[file_name] = []
    return chat_histories[file_name]

def update_transcript(file_name):
    """Write the current chat_history for the given file to the transcript file and commit it to git."""
    fname = transcript_filename(file_name)
    with open(fname, "w") as f:
        json.dump(chat_histories[file_name], f, indent=2)
    transcript_commit_msg = f"Update transcript for {os.path.basename(file_name)}"
    commit_changes(fname, transcript_commit_msg)

def extract_commit_summary(text):
    """Search for a line starting with 'Commit Summary:' at the beginning of a line and return its content."""
    match = re.search(r"^Commit Summary:\s*(.*)", text, re.MULTILINE)
    return match.group(1).strip() if match else ""

def extract_code(text):
    """
    Extract the contents of the first code block using a simple state machine.
    The code block is assumed to start with a line that (after stripping whitespace)
    starts with three backticks and ends when a line that is exactly three backticks is encountered
    """
    lines = text.splitlines()
    in_code_block = False
    code_lines = []
    for line in lines:
        stripped = line.strip()
        if not in_code_block:
            if stripped.startswith("```"):
                in_code_block = True
            continue
        else:
            if stripped == "```":
                break
            code_lines.append(line)
    return "\n".join(code_lines).strip()

def extract_professional_message(text):
    """Extract the professional message before the code block."""
    match = re.match(r"^(.*?)```", text, re.DOTALL)
    return match.group(1).strip() if match else text.strip()

def compute_diff(old_content, new_content):
    """Compute a unified diff between old_content and new_content."""
    old_lines = old_content.splitlines(keepends=True)
    new_lines = new_content.splitlines(keepends=True)
    diff_lines = difflib.unified_diff(old_lines, new_lines, fromfile="Before", tofile="After")
    return "".join(diff_lines)

def commit_changes(file_path, commit_message):
    """Stage the given file and commit changes to git with the provided commit message."""
    try:
        subprocess.run(["git", "add", file_path], check=True)
        subprocess.run(["git", "commit", "-m", commit_message], check=True)
        return True
    except subprocess.CalledProcessError:
        return False

def load_coding_contexts(context_names):
    """Load coding contexts from the contexts/ directory based on provided context names."""
    contexts = []
    for name in context_names:
        context_path = os.path.join("contexts", f"{name}.txt")
        if os.path.exists(context_path):
            try:
                with open(context_path, "r") as f:
                    content = f.read().strip()
                    if content:
                        contexts.append({"name": name, "content": content})
            except Exception as e:
                print(f"Error loading context '{name}': {e}")
        else:
            print(f"Context file '{context_path}' does not exist.")
    return contexts

def build_prompt_messages(system_prompt, user_prompt, file_name, model, coding_contexts):
    """
    Build a list of messages for the API:
      - Include the coding contexts at the beginning of the system prompt.
      - Include the system prompt. If the model is "o1-mini" (which doesn't support 'system'),
        include it as a user message prefixed with "SYSTEM:".
      - Append a final user message with the current on-disk file contents.
    """
    messages = []
    if coding_contexts:
        combined_context = "\n".join([f"Context: {ctx['name']}" for ctx in coding_contexts])
        system_prompt = f"{combined_context}\n\n{system_prompt}"
    if model == "o1-mini":
        messages.append({"role": "user", "content": "SYSTEM: " + system_prompt})
    else:
        messages.append({"role": "system", "content": system_prompt})
    
    # Add the most recent user prompt
    messages.append({"role": "user", "content": user_prompt})
    
    # Append a final user message with the current on-disk file contents.
    try:
        with open(file_name, "r") as f:
            file_contents = f.read()
    except Exception:
        file_contents = ""
    final_msg = {
        "role": "user",
        "content": "The following is the code which has been generated so far:\n" + file_contents
    }
    messages.append(final_msg)
    return messages

def get_directory_structure(path):
    """Recursively build a directory structure as a list of dictionaries."""
    structure = []
    try:
        for item in os.listdir(path):
            item_path = os.path.join(path, item)
            if os.path.isdir(item_path):
                structure.append({
                    "type": "directory",
                    "name": item,
                    "children": get_directory_structure(item_path)
                })
            else:
                structure.append({
                    "type": "file",
                    "name": item
                })
    except PermissionError:
        pass  # Skip directories for which the user does not have permissions
    return structure

app = Flask(__name__)

# Route to serve static files from the static/ directory.
@app.route("/static/<path:filename>")
def serve_static(filename):
    return send_from_directory("static", filename)

# Route to return the current transcript as JSON for a specific file.
@app.route("/transcript", methods=["GET"])
def get_transcript():
    file_name = request.args.get('file')
    if not file_name:
        return jsonify({"error": "No file specified."}), 400
    transcript = load_transcript_from_disk(file_name)
    return jsonify(transcript)

# Route to return the current source code content for a specific file.
@app.route("/source", methods=["GET"])
def get_source():
    file_name = request.args.get('file')
    if not file_name:
        return jsonify({"content": ""})
    if not os.path.exists(file_name):
        return jsonify({"content": ""})
    try:
        with open(file_name, "r") as f:
            content = f.read()
        return jsonify({"content": content})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Route to update the source code for a specific file.
@app.route("/update_source", methods=["POST"])
def update_source():
    data = request.get_json()
    if not data or "content" not in data or "file" not in data:
        return jsonify({"error": "No content or file specified."}), 400
    new_content = data["content"]
    file_name = data["file"]
    try:
        with open(file_name, "w") as f:
            f.write(new_content)
        commit_msg = "Manually updated source code via web UI."
        if commit_changes(file_name, commit_msg):
            return jsonify({"message": "Source code updated successfully."})
        else:
            return jsonify({"error": "Failed to commit changes to git."}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Route to get coding contexts as JSON
@app.route("/coding_contexts", methods=["GET"])
def get_coding_contexts():
    return jsonify(CODING_CONTEXTS)

# Route to get project structure as JSON
@app.route("/project_structure", methods=["GET"])
def project_structure():
    if not ACTIVE_FILES:
        return jsonify([])
    # Assuming all active files are in the same directory
    project_dir = os.path.dirname(os.path.abspath(ACTIVE_FILES[0]))
    structure = get_directory_structure(project_dir)
    return jsonify(structure)

# Chat endpoint: accepts a JSON prompt, updates conversation, file, and transcript, then returns the full conversation.
@app.route("/chat", methods=["POST"])
def chat():
    global chat_histories, CODING_CONTEXTS, DEBUG
    data = request.get_json()
    if not data or "prompt" not in data or "file" not in data:
        return jsonify({"error": "No prompt or file specified."}), 400
    user_input = data["prompt"]
    file_name = data["file"]
    if file_name not in chat_histories:
        load_transcript_from_disk(file_name)
    chat_histories[file_name].append({"role": "User", "content": user_input})

    if not os.path.exists(file_name) or os.path.getsize(file_name) == 0:
        system_prompt = (
            "You are an assistant managing a software project. When given a prompt, respond with a brief professional message summarizing the changes and any questions or suggestions you have. Then, generate the complete contents for the project file. Output only the code in a single code block (using triple backticks) without additional commentary."
        )
    else:
        system_prompt = (
            "You are an assistant managing a software project. The project file already has content. When given a prompt for changes, respond with a brief professional message summarizing the changes and any questions or suggestions you have. Then, generate the complete updated file contents. Output only the updated code in a single code block (using triple backticks). "
            "Then, on a new line after the code block, output a commit summary starting with 'Commit Summary:' followed by a brief description of the changes."
        )

    messages = build_prompt_messages(system_prompt, user_input, file_name, "o1-mini", CODING_CONTEXTS)

    if DEBUG:
        print("DEBUG: AI prompt messages:")
        print(json.dumps(messages, indent=2))

    try:
        response = client.chat.completions.create(
            model="o1-mini",
            messages=messages,
            temperature=1
        )
    except Exception as e:
        error_msg = f"Error calling OpenAI API: {str(e)}"
        chat_histories[file_name].append({"role": "Assistant", "content": error_msg})
        update_transcript(file_name)
        return jsonify(chat_histories[file_name]), 500

    reply = response.choices[0].message.content
    professional_message = extract_professional_message(reply)
    chat_histories[file_name].append({"role": "Assistant", "content": professional_message})

    new_file_content = extract_code(reply)
    commit_summary = extract_commit_summary(reply)

    if not os.path.exists(file_name) or os.path.getsize(file_name) == 0:
        with open(file_name, "w") as f:
            f.write(new_file_content)
    else:
        try:
            with open(file_name, "r") as f:
                old_content = f.read()
        except Exception:
            old_content = ""
        diff_text = compute_diff(old_content, new_file_content)
        if diff_text:
            with open(file_name, "w") as f:
                f.write(new_file_content)
            commit_msg = commit_summary if commit_summary else f"Applied changes: {user_input}"
            if not commit_changes(file_name, commit_msg):
                chat_histories[file_name].append({"role": "Assistant", "content": "Error committing changes to git."})
        else:
            chat_histories[file_name].append({"role": "Assistant", "content": "No changes detected."})

    update_transcript(file_name)
    return jsonify(chat_histories[file_name])

# Main page: serves the HTML page without specifying a default active file.
@app.route("/", methods=["GET"])
def index():
    return render_template_string(HTML_TEMPLATE)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Manage a software project via the OpenAI API.")
    parser.add_argument("source_files", nargs='+', help="Paths to the project files to manage.")
    parser.add_argument("--port", type=int, default=5000, help="Port on which the server will run (default: 5000)")
    parser.add_argument("--debug", action="store_true", help="Print full AI prompt on each API call for debugging.")
    parser.add_argument("--contexts", nargs='*', default=[], help="List of coding contexts to apply.")
    args = parser.parse_args()

    DEBUG = args.debug
    CODING_CONTEXTS = load_coding_contexts(args.contexts) if args.contexts else []
    for source_file in args.source_files:
        if not os.path.exists(source_file):
            open(source_file, "w").close()
        load_transcript_from_disk(source_file)
        ACTIVE_FILES.append(source_file)

    app.run(port=args.port)