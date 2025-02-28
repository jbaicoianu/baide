#!/usr/bin/env python3
import os
import re
import json
import argparse
import subprocess
import difflib
from flask import Flask, request, render_template, send_from_directory, jsonify
import openai

# Instantiate an OpenAI client with your API key.
API_KEY = os.getenv("OPENAI_API_KEY")
client = openai.Client(api_key=API_KEY)

# Global variables for managing multiple files, coding contexts, and debugging.
ACTIVE_FILES = []
CODING_CONTEXTS = []
DEBUG = False

# In-memory conversation histories mapped by filename.
chat_histories = {}

# Global variable to track the last modification time of editor.html
editor_template_mtime = None
editor_template_path = os.path.join("templates", "editor.html")
if os.path.exists(editor_template_path):
    editor_template_mtime = os.path.getmtime(editor_template_path)

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
    structure.sort(key=lambda x: 0 if x["type"] == "directory" else 1)
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

# Route to create a new file.
@app.route("/create_file", methods=["POST"])
def create_file():
    data = request.get_json()
    if not data or "file" not in data:
        return jsonify({"error": "No file name specified."}), 400
    file_name = data["file"]
    if os.path.exists(file_name):
        return jsonify({"error": "File already exists."}), 400
    try:
        directory = os.path.dirname(file_name)
        if directory:  # Check if a directory path is provided
            os.makedirs(directory, exist_ok=True)  # Create directories as needed
        with open(file_name, "w") as f:
            f.write("")  # Create an empty file
        commit_msg = f"Create new file {file_name}"
        if commit_changes(file_name, commit_msg):
            return jsonify({"success": True})
        else:
            return jsonify({"error": "Failed to commit new file to git."}), 500
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

# Main page: serves the HTML page with template reloading logic.
@app.route("/", methods=["GET"])
def index():
    global editor_template_mtime
    if os.path.exists(editor_template_path):
        current_mtime = os.path.getmtime(editor_template_path)
        if editor_template_mtime != current_mtime:
            app.jinja_env.cache = {}
            editor_template_mtime = current_mtime
    return render_template("editor.html")

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