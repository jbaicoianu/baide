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

# Global variables for the file we are managing, coding contexts, and debugging.
SOURCE_FILE = None
CODING_CONTEXTS = []
DEBUG = False

# HTML template for the chat interface.
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
      /* Middle Column - Source Code Editor and Chat */
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
        max-height: 50%;
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
    </style>
    <!-- Load Marked for Markdown parsing -->
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script>
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

      // Function to load source code into the editor
      async function loadSourceCode() {
        try {
          const response = await fetch('/source');
          if (response.ok) {
            const data = await response.json();
            document.getElementById('sourceCode').value = data.content;
          }
        } catch (e) {
          console.error('Error loading source code:', e);
        }
      }

      // Function to update source code from the editor (optional)
      async function updateSourceCode() {
        const updatedContent = document.getElementById('sourceCode').value;
        try {
          const response = await fetch('/update_source', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: updatedContent })
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

      // Append a coding context badge to codingContexts
      function appendCodingContext(context) {
        if (!context || !context.name) return;
        const badgeSpan = document.createElement('span');
        badgeSpan.className = 'badge';
        badgeSpan.textContent = context.name;
        if (context.content) {
          badgeSpan.title = context.content; // Tooltip with full content
        }
        codingContexts.appendChild(badgeSpan);
      }

      // Scroll to the bottom of an element.
      function scrollToBottom(element) {
        element.scrollTop = element.scrollHeight;
      }

      // Load the existing conversation transcript from the server.
      async function loadTranscript() {
        try {
          const response = await fetch('/transcript');
          if (response.ok) {
            const data = await response.json();
            data.forEach(msg => {
              if (msg.role.toLowerCase() === 'assistant') {
                const professionalMessage = extractProfessionalMessage(msg.content);
                appendMessage(msg.role, professionalMessage);
                const commit = extractCommitSummary(msg.content);
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
            if (contextsData && contextsData.length > 0) {
              contextsData.forEach(ctx => {
                appendCodingContext(ctx);
              });
              scrollToBottom(codingContexts);
            }
          }
        } catch (e) {
          console.error('Error loading transcript or coding contexts:', e);
        }
      }

      // Function to extract commit summary
      function extractCommitSummary(content) {
        const regex = /^Commit Summary:\s*(.+)/m;
        const match = content.match(regex);
        return match ? match[1].trim() : null;
      }

      // Function to extract the professional message before the code block.
      function extractProfessionalMessage(content) {
        const regex = /^(.*?)```/s;
        const match = content.match(regex);
        return match ? match[1].trim() : content.trim();
      }

      // Listen for Ctrl+Enter to submit the form.
      function setupEventListeners() {
        const promptInput = document.getElementById("promptInput");
        const chatForm = document.getElementById("chatForm");
        const throbber = document.getElementById("throbber");
        const chatBox = document.getElementById("chatBox");
        const commitSummaries = document.getElementById("commitSummaries");
        const codingContexts = document.getElementById("codingContexts");

        promptInput.addEventListener("keydown", function(e) {
          if (e.ctrlKey && e.key === "Enter") {
            e.preventDefault();
            chatForm.dispatchEvent(new Event("submit", {cancelable: true}));
          }
        });

        chatForm.addEventListener('submit', async (e) => {
          e.preventDefault();
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
              body: JSON.stringify({ prompt: prompt })
            });
            if (response.ok) {
              const data = await response.json();
              chatBox.innerHTML = "";
              commitSummaries.innerHTML = "";
              codingContexts.innerHTML = "";
              data.forEach(msg => {
                if (msg.role.toLowerCase() === 'assistant') {
                  const professionalMessage = extractProfessionalMessage(msg.content);
                  appendMessage(msg.role, professionalMessage);
                  const commit = extractCommitSummary(msg.content);
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
              await loadSourceCode();
              // Reload coding contexts
              await loadCodingContexts();
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
            if (data && data.length > 0) {
              data.forEach(ctx => {
                appendCodingContext(ctx);
              });
              scrollToBottom(codingContexts);
            }
          }
        } catch (e) {
          console.error('Error loading coding contexts:', e);
        }
      }

      // On startup, load the previous conversation (if any), source code, and coding contexts.
      window.onload = function() {
        loadTranscript();
        loadSourceCode();
        setupEventListeners();
      };
    </script>
  </head>
  <body>
    <div id="container">
      <!-- Left Column - Project Browser -->
      <div id="projectBrowser">
        <h2>Project Browser</h2>
        <p>Placeholder for project files.</p>
      </div>
      <!-- Middle Column - Active Coding Contexts, Source Code Editor and Chat -->
      <div id="mainContent">
        <div id="activeCodingContextsContainer">
          <h2>Active Coding Contexts</h2>
          <div id="activeCodingContexts">
            <!-- Coding contexts will be loaded here via JavaScript as badges -->
          </div>
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

# In-memory conversation history.
chat_history = []

def transcript_filename():
    """Return the transcript filename based on the active file's basename."""
    base, _ = os.path.splitext(SOURCE_FILE)
    return f"{base}-transcript.json"

def load_transcript_from_disk():
    """Load transcript from disk into chat_history (if it exists)."""
    fname = transcript_filename()
    if os.path.exists(fname):
        try:
            with open(fname, "r") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
        except Exception:
            pass
    return []

def update_transcript():
    """Write the current chat_history to the transcript file and commit it to git."""
    fname = transcript_filename()
    with open(fname, "w") as f:
        json.dump(chat_history, f, indent=2)
    transcript_commit_msg = f"Update transcript for {os.path.basename(SOURCE_FILE)}"
    commit_changes(fname, transcript_commit_msg)

def extract_commit_summary(text):
    """Search for a line starting with 'Commit Summary:' at the beginning of a line and return its content."""
    match = re.search(r"^Commit Summary:\s*(.*)", text, re.MULTILINE)
    return match.group(1).strip() if match else ""

def extract_code(text):
    """
    Extract the contents of the first code block using a simple state machine.
    The code block is assumed to start with a line that (after stripping whitespace)
    starts with three backticks and ends when a line that is exactly three backticks is encountered.
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

def build_prompt_messages(system_prompt, conversation, source_file, model, coding_contexts):
    """
    Build a list of messages for the API:
      - Include the coding contexts at the beginning of the system prompt.
      - Include the system prompt. If the model is "o1-mini" (which doesn't support 'system'),
        include it as a user message prefixed with "SYSTEM:".
      - For each user message, include it verbatim.
      - For each assistant message, include only the commit summary.
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
    for msg in conversation:
        role = msg["role"].lower()
        if role == "assistant":
            commit = extract_commit_summary(msg["content"])
            if commit:
                messages.append({"role": role, "content": commit})
        else:
            messages.append({"role": role, "content": msg["content"]})
    try:
        with open(source_file, "r") as f:
            file_contents = f.read()
    except Exception:
        file_contents = ""
    final_msg = {
        "role": "user",
        "content": "The following is the code which has been generated so far:\n" + file_contents
    }
    messages.append(final_msg)
    return messages

app = Flask(__name__)

# Route to serve static files from the static/ directory.
@app.route("/static/<path:filename>")
def serve_static(filename):
    return send_from_directory("static", filename)

# Route to return the current transcript as JSON.
@app.route("/transcript", methods=["GET"])
def get_transcript():
    return jsonify(chat_history)

# New Route to get the current source code content
@app.route("/source", methods=["GET"])
def get_source():
    if not os.path.exists(SOURCE_FILE):
        return jsonify({"content": ""})
    try:
        with open(SOURCE_FILE, "r") as f:
            content = f.read()
        return jsonify({"content": content})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# New Route to update the source code (optional)
@app.route("/update_source", methods=["POST"])
def update_source():
    data = request.get_json()
    if not data or "content" not in data:
        return jsonify({"error": "No content provided."}), 400
    new_content = data["content"]
    try:
        with open(SOURCE_FILE, "w") as f:
            f.write(new_content)
        commit_msg = "Manually updated source code via web UI."
        if commit_changes(SOURCE_FILE, commit_msg):
            return jsonify({"message": "Source code updated successfully."})
        else:
            return jsonify({"error": "Failed to commit changes to git."}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# New Route to get coding contexts as JSON
@app.route("/coding_contexts", methods=["GET"])
def get_coding_contexts():
    return jsonify(CODING_CONTEXTS)

# Chat endpoint: accepts a JSON prompt, updates conversation, file, and transcript, then returns the full conversation.
@app.route("/chat", methods=["POST"])
def chat():
    global chat_history, SOURCE_FILE, DEBUG
    data = request.get_json()
    if not data or "prompt" not in data:
        return jsonify({"error": "No prompt provided."}), 400
    user_input = data["prompt"]
    chat_history.append({"role": "User", "content": user_input})

    if not os.path.exists(SOURCE_FILE) or os.path.getsize(SOURCE_FILE) == 0:
        system_prompt = (
            "You are an assistant managing a software project. When given a prompt, respond with a brief professional message summarizing the changes and any questions or suggestions you have. Then, generate the complete contents for the project file. Output only the code in a single code block (using triple backticks) without additional commentary."
        )
    else:
        system_prompt = (
            "You are an assistant managing a software project. The project file already has content. When given a prompt for changes, respond with a brief professional message summarizing the changes and any questions or suggestions you have. Then, generate the complete updated file contents. Output only the updated code in a single code block (using triple backticks). "
            "Then, on a new line after the code block, output a commit summary starting with 'Commit Summary:' followed by a brief description of the changes."
        )

    messages = build_prompt_messages(system_prompt, chat_history, SOURCE_FILE, "o1-mini", CODING_CONTEXTS)

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
        chat_history.append({"role": "Assistant", "content": error_msg})
        update_transcript()
        return jsonify(chat_history), 500

    reply = response.choices[0].message.content
    professional_message = extract_professional_message(reply)
    chat_history.append({"role": "Assistant", "content": professional_message})

    new_file_content = extract_code(reply)
    commit_summary = extract_commit_summary(reply)

    if not os.path.exists(SOURCE_FILE) or os.path.getsize(SOURCE_FILE) == 0:
        with open(SOURCE_FILE, "w") as f:
            f.write(new_file_content)
    else:
        try:
            with open(SOURCE_FILE, "r") as f:
                old_content = f.read()
        except Exception:
            old_content = ""
        diff_text = compute_diff(old_content, new_file_content)
        if diff_text:
            with open(SOURCE_FILE, "w") as f:
                f.write(new_file_content)
            commit_msg = commit_summary if commit_summary else f"Applied changes: {user_input}"
            if not commit_changes(SOURCE_FILE, commit_msg):
                chat_history.append({"role": "Assistant", "content": "Error committing changes to git."})
        else:
            chat_history.append({"role": "Assistant", "content": "No changes detected."})

    update_transcript()
    return jsonify(chat_history)

# Main page: serves the HTML page with the active file indicator.
@app.route("/", methods=["GET"])
def index():
    return render_template_string(HTML_TEMPLATE, source_file=SOURCE_FILE)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Manage a software project via the OpenAI API.")
    parser.add_argument("source_file", help="Path to the project file to manage.")
    parser.add_argument("--port", type=int, default=5000, help="Port on which the server will run (default: 5000)")
    parser.add_argument("--debug", action="store_true", help="Print full AI prompt on each API call for debugging.")
    parser.add_argument("--contexts", nargs='*', default=[], help="List of coding contexts to apply.")
    args = parser.parse_args()

    SOURCE_FILE = args.source_file
    DEBUG = args.debug
    if not os.path.exists(SOURCE_FILE):
        open(SOURCE_FILE, "w").close()
    chat_history = load_transcript_from_disk()
    CODING_CONTEXTS = load_coding_contexts(args.contexts) if args.contexts else []

    app.run(port=args.port)