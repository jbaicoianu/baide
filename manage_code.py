#!/usr/bin/env python3
import os
import re
import json
import argparse
import subprocess
import difflib
from flask import Flask, request, render_template, send_from_directory, jsonify
import openai
from datetime import datetime  # Added for timestamping

# Instantiate an OpenAI client with your API key.
API_KEY = os.getenv("OPENAI_API_KEY")
client = openai.Client(api_key=API_KEY)

# Define the projects directory
PROJECTS_DIR = os.path.join(os.path.expanduser("~"), "projects")

def get_current_project_name():
    """Retrieve the current project name based on the current working directory."""
    return os.path.basename(os.getcwd())

def get_project_path(project_name=None):
    """Get the absolute path of the project directory. Defaults to current project."""
    if not project_name:
        project_name = get_current_project_name()
    return os.path.join(PROJECTS_DIR, project_name)

def validate_project(project_name=None):
    """Validate the project name and ensure its directory exists. Defaults to current project."""
    if not project_name:
        project_name = get_current_project_name()
    if not re.match(r"^[\w\-]+$", project_name):
        return False, "Invalid project name. Use only letters, numbers, underscores, and hyphens."
    project_path = get_project_path(project_name)
    if not os.path.isdir(project_path):
        return False, "Project does not exist."
    return True, project_path

def transcript_filename(project_name=None, file_name=None):
    """Return the transcript filename based on the project and file name's basename."""
    if not project_name:
        project_name = get_current_project_name()
    base, _ = os.path.splitext(file_name)
    return os.path.join(get_project_path(project_name), f"{base}-transcript.json")

def load_transcript_from_disk(project_name=None, file_name=None):
    """Load transcript from disk into chat_histories for the given project and file (if it exists)."""
    if not project_name:
        project_name = get_current_project_name()
    fname = transcript_filename(project_name, file_name)
    key = f"{project_name}/{file_name}"
    if os.path.exists(fname):
        try:
            with open(fname, "r") as f:
                data = json.load(f)
                if isinstance(data, list):
                    chat_histories[key] = data
                    return data
        except Exception:
            pass
    chat_histories[key] = []
    return chat_histories[key]

def update_transcript(project_name=None, file_name=None, commit_hash=None):
    """Write the current chat_history for the given project and file to the transcript file and commit it to git."""
    if not project_name:
        project_name = get_current_project_name()
    fname = transcript_filename(project_name, file_name)
    key = f"{project_name}/{file_name}"
    with open(fname, "w") as f:
        json.dump(chat_histories[key], f, indent=2)
    transcript_commit_msg = f"Update transcript for {os.path.basename(file_name)}"
    commit_hash = commit_changes(project_name, fname, transcript_commit_msg)
    # Optionally, you can store the commit_hash if needed
    return commit_hash

def load_all_contexts(project_name=None):
    """Load all contexts from the contexts/ directory within the project as dictionaries with name and content."""
    if not project_name:
        project_name = get_current_project_name()
    contexts = []
    contexts_dir = os.path.join(get_project_path(project_name), "contexts")
    if not os.path.isdir(contexts_dir):
        print(f"Contexts directory '{contexts_dir}' does not exist.")
        return contexts
    for filename in os.listdir(contexts_dir):
        if filename.endswith(".txt"):
            context_name = os.path.splitext(filename)[0]
            context_path = os.path.join(contexts_dir, filename)
            try:
                with open(context_path, "r") as f:
                    content = f.read().strip()
                contexts.append({"name": context_name, "content": content})
            except Exception as e:
                print(f"Error loading context '{context_name}': {e}")
    return contexts

def load_contexts_by_names(project_name=None, context_names=None):
    """Load specific contexts by their names from the contexts/ directory within the current working directory."""
    contexts = []
    if not context_names:
        return contexts
    contexts_dir = os.path.join(os.getcwd(), "contexts")
    for name in context_names:
        context_path = os.path.join(contexts_dir, f"{name}.txt")
        if os.path.exists(context_path):
            try:
                with open(context_path, "r") as f:
                    content = f.read().strip()
                    if content:
                        contexts.append(content)
            except Exception as e:
                print(f"Error loading context '{name}': {e}")
        else:
            print(f"Context file '{context_path}' does not exist.")
    return contexts

def build_prompt_messages(system_prompt, user_prompt, file_name, model, coding_contexts, project_name=None):
    """
    Build a list of messages for the API:
      - Include the system prompt.
      - Include all coding context prompts (if provided).
      - Append the user prompt.
      - Append a final user message with the current on-disk file contents.
    Roles are assigned based on the model:
      - If model is "o1-mini", system and context prompts use role="user".
      - Otherwise, they use role="system".
    """
    if not project_name:
        project_name = get_current_project_name()
    messages = []

    # Combine system prompt and coding contexts
    if coding_contexts:
        combined_context = "\n\n".join(coding_contexts)
        full_system_prompt = f"{system_prompt}\n\n{combined_context}"
    else:
        full_system_prompt = system_prompt

    # Assign role based on model
    role = "user" if model == "o1-mini" else "system"
    messages.append({"role": role, "content": full_system_prompt})

    # Add the user prompt
    messages.append({"role": "user", "content": user_prompt})

    # Append a final user message with the current on-disk file contents or prompt to start
    project_path = get_project_path(project_name)
    file_path = os.path.join(project_path, file_name)
    try:
        with open(file_path, "r") as f:
            file_contents = f.read()
    except Exception:
        file_contents = ""
    if file_contents:
        final_content = f"The file is named {file_name} and the following is the code which has been generated so far:\n" + file_contents
    else:
        final_content = f"The file is named {file_name} - please start generating code for this file."
    final_msg = {
        "role": "user",
        "content": final_content
    }
    messages.append(final_msg)
    return messages

def get_available_models():
    """Retrieve the list of available OpenAI models dynamically."""
    try:
        response = client.models.list()
        print(response.data)
        return [model.id for model in response.data]
    except Exception as e:
        print(f"Error fetching available models: {e}")
        # Fallback to default models if API call fails
        return [
            "o1-mini",
            "gpt-3.5-turbo",
            "gpt-4",
            "text-davinci-003",
            "text-curie-001",
            "text-babbage-001",
            "text-ada-001"
        ]

# Define available OpenAI models dynamically
AVAILABLE_MODELS = get_available_models()

# Global variables for managing multiple files and debugging.
# ACTIVE_FILES = []  # Consider removing if not used elsewhere
DEBUG = False

# In-memory conversation histories mapped by project and filename.
chat_histories = {}

# Global variable to track the last modification time of editor.html
editor_template_mtime = None
editor_template_path = os.path.join("templates", "editor.html")
if os.path.exists(editor_template_path):
    editor_template_mtime = os.path.getmtime(editor_template_path)

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

def commit_changes(project_name=None, file_path=None, commit_message=None):
    """Stage the given file and commit changes to git with the provided commit message. Returns commit hash."""
    if not project_name:
        project_name = get_current_project_name()
    project_path = get_project_path(project_name)
    try:
        subprocess.run(["git", "add", file_path], cwd=project_path, check=True)
        subprocess.run(["git", "commit", "-m", commit_message], cwd=project_path, check=True)
        # Get the latest commit hash
        result = subprocess.run(["git", "rev-parse", "HEAD"], cwd=project_path, capture_output=True, text=True, check=True)
        commit_hash = result.stdout.strip()
        return commit_hash
    except subprocess.CalledProcessError:
        return None

def get_current_git_branch(project_path):
    """Helper function to get the current Git branch."""
    try:
        result = subprocess.run(["git", "branch", "--show-current"], cwd=project_path, capture_output=True, text=True, check=True)
        current_branch = result.stdout.strip()
        return current_branch
    except subprocess.CalledProcessError:
        return "unknown"

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
    project_name = request.args.get('project_name')
    file_name = request.args.get('file')
    if not file_name:
        return jsonify({"error": "No file specified."}), 400
    is_valid, result = validate_project(project_name)
    if not is_valid:
        return jsonify({"error": result}), 400
    transcript = load_transcript_from_disk(project_name, file_name)
    return jsonify(transcript)

# Route to return the current source code content for a specific file.
@app.route("/source", methods=["GET"])
def get_source():
    project_name = request.args.get('project_name')
    file_name = request.args.get('file')
    if not file_name:
        return jsonify({"content": ""})
    is_valid, project_path = validate_project(project_name)
    if not is_valid:
        return jsonify({"error": project_path}), 400
    file_path = os.path.join(project_path, file_name)
    if not os.path.exists(file_path):
        return jsonify({"content": ""})
    try:
        with open(file_path, "r") as f:
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
    project_name = data.get("project_name")
    commit_message = data.get("commit_message", "Manually updated source code via web UI.")

    is_valid, project_path = validate_project(project_name)
    if not is_valid:
        return jsonify({"error": project_path}), 400

    file_path = os.path.join(project_path, file_name)
    try:
        with open(file_path, "w") as f:
            f.write(new_content)
        commit_hash = commit_changes(project_name, file_path, commit_message)
        if commit_hash:
            # Add timestamp, branch, and commit hash to transcript
            current_branch = get_current_git_branch(project_path)
            timestamp = datetime.utcnow().isoformat() + "Z"
            key = f"{project_name}/{file_name}"
            if key not in chat_histories:
                load_transcript_from_disk(project_name, file_name)
            transcript_entry = {
                "role": "User",
                "content": f"{commit_message} [Manual edit]",
                "timestamp": timestamp,
                "branch": current_branch,
                "commit_hash": commit_hash
            }
            chat_histories[key].append(transcript_entry)
            update_transcript(project_name, file_name, commit_hash)
            return jsonify({
                "message": "Source code updated successfully.",
                "commit_hash": commit_hash,
                "chat_history": chat_histories[key]
            })
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
    project_name = data.get("project_name")

    is_valid, project_path = validate_project(project_name)
    if not is_valid:
        return jsonify({"error": project_path}), 400

    file_path = os.path.join(project_path, file_name)
    if os.path.exists(file_path):
        return jsonify({"error": "File already exists."}), 400
    try:
        directory = os.path.dirname(file_path)
        if directory:  # Check if a directory path is provided
            os.makedirs(directory, exist_ok=True)  # Create directories as needed
        with open(file_path, "w") as f:
            f.write("")  # Create an empty file
        commit_msg = f"Create new file {file_name}"
        commit_hash = commit_changes(project_name, file_path, commit_msg)
        if commit_hash:
            # Add timestamp, branch, and commit hash to transcript
            current_branch = get_current_git_branch(project_path)
            timestamp = datetime.utcnow().isoformat() + "Z"
            key = f"{project_name}/{file_name}"
            if key not in chat_histories:
                load_transcript_from_disk(project_name, file_name)
            transcript_entry = {
                "role": "System",
                "content": f"Created new file {file_name}.",
                "timestamp": timestamp,
                "branch": current_branch,
                "commit_hash": commit_hash
            }
            chat_histories[key].append(transcript_entry)
            update_transcript(project_name, file_name, commit_hash)
            return jsonify({"success": True, "commit_hash": commit_hash})
        else:
            return jsonify({"error": "Failed to commit new file to git."}), 500
    except subprocess.CalledProcessError as e:
        return jsonify({"error": f"Git operation failed: {e}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Route to get coding contexts as JSON
@app.route("/coding_contexts", methods=["GET"])
def get_coding_contexts():
    project_name = get_current_project_name()
    is_valid, project_path = validate_project(project_name)
    if not is_valid:
        return jsonify({"error": project_path}), 400
    context_names = load_all_contexts(project_name)
    return jsonify(context_names)

# Route to return the project structure as JSON.
@app.route("/projects/structure", methods=["GET"])
def projects_structure():
    project_name = request.args.get('project_name')
    if not project_name:
        project_name = get_current_project_name()
    is_valid, project_path = validate_project(project_name)
    if not is_valid:
        return jsonify({"error": project_path}), 400
    structure = get_directory_structure(project_path)
    return jsonify(structure)

# New Endpoint: Get Available AI Models
@app.route("/models", methods=["GET"])
def get_models():
    return jsonify({"models": AVAILABLE_MODELS, "defaultmodel": "o1-mini"})

# New Endpoint: Get Current Git Branch
@app.route("/git_current_branch", methods=["GET"])
def git_current_branch():
    project_name = request.args.get('project_name')
    if not project_name:
        project_name = get_current_project_name()
    is_valid, project_path = validate_project(project_name)
    if not is_valid:
        return jsonify({"error": project_path}), 400
    try:
        current_branch = get_current_git_branch(project_path)
        return jsonify({"current_branch": current_branch})
    except subprocess.CalledProcessError as e:
        return jsonify({"error": "Failed to get current branch.", "details": e.stderr.strip()}), 500

# New Endpoint: List All Git Branches
@app.route("/git_branches", methods=["GET"])
def git_branches():
    project_name = request.args.get('project_name')
    if not project_name:
        project_name = get_current_project_name()
    is_valid, project_path = validate_project(project_name)
    if not is_valid:
        return jsonify({"error": project_path}), 400
    try:
        result = subprocess.run(["git", "branch"], cwd=project_path, capture_output=True, text=True, check=True)
        branches = [re.sub(r'^(\* |\+ )', '', line.strip()) for line in result.stdout.strip().split('\n') if line.strip()]
        return jsonify({"branches": branches})
    except subprocess.CalledProcessError as e:
        return jsonify({"error": "Failed to list branches.", "details": e.stderr.strip()}), 500

# New Endpoint: Switch Git Branch
@app.route("/git_switch_branch", methods=["POST"])
def git_switch_branch():
    data = request.get_json()
    if not data or "branch" not in data:
        return jsonify({"success": False, "error": "No branch specified."}), 400
    branch = data["branch"]
    project_name = data.get("project_name")
    
    if not project_name:
        project_name = get_current_project_name()
    is_valid, project_path = validate_project(project_name)
    if not is_valid:
        return jsonify({"success": False, "error": project_path}), 400

    try:
        subprocess.run(["git", "checkout", branch], cwd=project_path, check=True)
        # Optionally, update the branch name in active transcripts
        return jsonify({"success": True})
    except subprocess.CalledProcessError as e:
        return jsonify({"success": False, "error": f"Failed to switch to branch '{branch}'."}), 500

# New Endpoint: Create Git Branch
@app.route("/git_create_branch", methods=["POST"])
def git_create_branch():
    data = request.get_json()
    if not data or "branch" not in data:
        return jsonify({"success": False, "error": "No branch name specified."}), 400
    branch = data["branch"]
    project_name = data.get("project_name")
    
    if not project_name:
        project_name = get_current_project_name()
    is_valid, project_path = validate_project(project_name)
    if not is_valid:
        return jsonify({"success": False, "error": project_path}), 400

    try:
        subprocess.run(["git", "checkout", "-b", branch], cwd=project_path, check=True)
        return jsonify({"success": True})
    except subprocess.CalledProcessError as e:
        return jsonify({"success": False, "error": f"Failed to create branch '{branch}'."}), 500

# New Endpoint: Add Project
@app.route("/projects/add", methods=["POST"])
def add_project():
    data = request.get_json()
    if not data or "project_name" not in data:
        return jsonify({"success": False, "error": "No project name specified."}), 400
    project_name = data["project_name"]
    if not re.match(r"^[\w\-]+$", project_name):
        return jsonify({"success": False, "error": "Invalid project name. Use only letters, numbers, underscores, and hyphens."}), 400
    project_path = get_project_path(project_name)
    if os.path.exists(project_path):
        return jsonify({"success": False, "error": "Project already exists."}), 400
    try:
        os.makedirs(project_path, exist_ok=True)
        # Initialize empty git repository
        subprocess.run(["git", "init"], cwd=project_path, check=True)
        # Create README.md template
        readme_content = f"# {project_name}\n\n" \
                         "## Description\n\n" \
                         "Provide a short description of your project here.\n\n" \
                         "## Installation\n\n" \
                         "Describe the installation process.\n\n" \
                         "## Usage\n\n" \
                         "Provide examples and usage instructions.\n\n" \
                         "## Contributing\n\n" \
                         "Guidelines for contributing to the project.\n\n" \
                         "## License\n\n" \
                         "Specify the license under which the project is distributed."
        readme_path = os.path.join(project_path, "README.md")
        with open(readme_path, "w") as f:
            f.write(readme_content)
        # Commit the initial files
        commit_msg = f"Initialize project '{project_name}' with README.md and git repository."
        subprocess.run(["git", "add", "."], cwd=project_path, check=True)
        subprocess.run(["git", "commit", "-m", commit_msg], cwd=project_path, check=True)
        return jsonify({"success": True, "project": project_name}), 201
    except subprocess.CalledProcessError as e:
        return jsonify({"success": False, "error": f"Git operation failed: {e}"}), 500
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# New Endpoint: List Projects
@app.route("/projects/list", methods=["GET"])
def list_projects():
    try:
        if not os.path.isdir(PROJECTS_DIR):
            return jsonify({"projects": []})
        projects = [name for name in os.listdir(PROJECTS_DIR)
                    if os.path.isdir(os.path.join(PROJECTS_DIR, name))]
        return jsonify({"projects": projects})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# New Endpoint: Get Project Details
@app.route("/projects/details", methods=["GET"])
def get_project_details():
    project_name = request.args.get('project_name') or get_current_project_name()
    if not re.match(r"^[\w\-]+$", project_name):
        return jsonify({"error": "Invalid project name."}), 400
    project_path = get_project_path(project_name)
    if not os.path.isdir(project_path):
        return jsonify({"error": "Project does not exist."}), 404
    try:
        # Get Git status
        result = subprocess.run(["git", "status", "--porcelain"], cwd=project_path, capture_output=True, text=True)
        git_status = result.stdout.strip()
        # Get Git branches
        result = subprocess.run(["git", "branch"], cwd=project_path, capture_output=True, text=True)
        branches = [line.strip().lstrip("* ").strip() for line in result.stdout.strip().split('\n') if line.strip()]
        details = {
            "project_name": project_name,
            "path": project_path,
            "git_status": git_status,
            "branches": branches
        }
        return jsonify(details)
    except subprocess.CalledProcessError as e:
        return jsonify({"error": f"Git operation failed: {e}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Chat endpoint: accepts a JSON prompt, updates conversation, file, and transcript, then returns the full conversation.
@app.route("/chat", methods=["POST"])
def chat():
    global chat_histories, DEBUG
    data = request.get_json()
    if not data or "prompt" not in data or "file" not in data:
        return jsonify({"error": "No prompt or file specified."}), 400
    user_input = data["prompt"]
    file_name = data["file"]
    project_name = data.get("project_name")
    context_names = data.get("contexts", [])  # List of context names

    # Retrieve the selected model, default to 'o1-mini' if not provided
    model = data.get("model", "o1-mini")
    if model not in AVAILABLE_MODELS:
        return jsonify({"error": f"Model '{model}' is not supported."}), 400

    is_valid, project_path = validate_project(project_name)
    if not is_valid:
        return jsonify({"error": project_path}), 400

    key = f"{project_name}/{file_name}"
    if key not in chat_histories:
        load_transcript_from_disk(project_name, file_name)

    timestamp = datetime.utcnow().isoformat() + "Z"
    current_branch = get_current_git_branch(project_path)
    chat_histories[key].append({
        "role": "User",
        "content": user_input,
        "timestamp": timestamp,
        "branch": current_branch,
        "model": model
    })

    # Load specified contexts
    coding_contexts = load_contexts_by_names(project_name, context_names)

    if not os.path.exists(os.path.join(project_path, file_name)) or os.path.getsize(os.path.join(project_path, file_name)) == 0:
        system_prompt = (
            "You are an assistant managing a software project. When given a prompt, respond with a brief professional message summarizing the changes and any questions or suggestions you have. Then, generate the complete contents for the project file. Output only the code in a single code block (using triple backticks) without additional commentary. Ensure that you never delete or change existing code unless it is part of the requested changes. Do not summarize or omit any existing unchanged functions."
        )
    else:
        system_prompt = (
            "You are an assistant managing a software project. The project file already has content. When given a prompt for changes, respond with a brief professional message summarizing the changes and any questions or suggestions you have. Then, generate the complete updated file contents. Output only the updated code in a single code block (using triple backticks). Then, on a new line after the code block, output a commit summary starting with 'Commit Summary:' followed by a brief description of the changes. Ensure that you never delete or change existing code unless it is part of the requested changes. Do not summarize or omit any existing unchanged functions."
        )

    messages = build_prompt_messages(system_prompt, user_input, file_name, model, coding_contexts, project_name)

    if DEBUG:
        print("DEBUG: AI prompt messages:")
        print(json.dumps(messages, indent=2))

    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=1
        )
    except Exception as e:
        error_msg = f"Error calling OpenAI API: {str(e)}"
        chat_histories[key].append({"role": "Assistant", "content": error_msg, "timestamp": datetime.utcnow().isoformat() + "Z", "branch": current_branch, "model": model})
        update_transcript(project_name, file_name)
        return jsonify(chat_histories[key]), 500

    reply = response.choices[0].message.content
    professional_message = extract_professional_message(reply)
    new_file_content = extract_code(reply)
    commit_summary = extract_commit_summary(reply)

    commit_hash = None  # Initialize commit_hash

    file_path = os.path.join(project_path, file_name)

    if not os.path.exists(file_path) or os.path.getsize(file_path) == 0:
        try:
            with open(file_path, "w") as f:
                f.write(new_file_content)
            commit_msg = commit_summary if commit_summary else f"Initial commit based on prompt: {user_input}"
            commit_hash = commit_changes(project_name, file_path, commit_msg)
            if not commit_hash:
                raise Exception("Failed to commit changes to git.")
        except Exception as e:
            error_msg = f"Error applying changes: {str(e)}"
            chat_histories[key].append({"role": "Assistant", "content": error_msg, "timestamp": datetime.utcnow().isoformat() + "Z", "branch": current_branch, "model": model})
            update_transcript(project_name, file_name)
            return jsonify(chat_histories[key]), 500
    else:
        try:
            with open(file_path, "r") as f:
                old_content = f.read()
            if old_content != new_file_content:
                with open(file_path, "w") as f:
                    f.write(new_file_content)
                commit_msg = commit_summary if commit_summary else f"Applied changes: {user_input}"
                commit_hash = commit_changes(project_name, file_path, commit_msg)
                if not commit_hash:
                    raise Exception("Failed to commit changes to git.")
        except Exception as e:
            error_msg = f"Error applying changes: {str(e)}"
            chat_histories[key].append({"role": "Assistant", "content": error_msg, "timestamp": datetime.utcnow().isoformat() + "Z", "branch": current_branch, "model": model})
            update_transcript(project_name, file_name)
            return jsonify(chat_histories[key]), 500

    # Append only the professional message with commit_hash
    chat_histories[key].append({
        "role": "Assistant",
        "content": professional_message,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "branch": current_branch,
        "commit_hash": commit_hash,
        "model": model
    })

    update_transcript(project_name, file_name, commit_hash)
    return jsonify(chat_histories[key])

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
    # Removed project_name and source_files arguments
    parser.add_argument("--port", type=int, default=5000, help="Port on which the server will run (default: 5000)")
    parser.add_argument("--debug", action="store_true", help="Print full AI prompt on each API call for debugging.")
    args = parser.parse_args()

    DEBUG = args.debug

    # Ensure the projects directory exists
    os.makedirs(PROJECTS_DIR, exist_ok=True)

    app.run(port=args.port)