#!/usr/bin/env python3
import os
import re
import sys
import argparse
import subprocess
from flask import Flask, request, render_template_string
from openai import OpenAI

client = OpenAI()

# Global variable for the file we are managing.
SOURCE_FILE = None

# A very simple HTML template to mimic a chat interface.
HTML_TEMPLATE = '''
<!doctype html>
<html>
  <head>
    <title>Project Manager Chat</title>
    <style>
      body { font-family: sans-serif; margin: 20px; }
      .chat-box { border: 1px solid #ccc; padding: 10px; height: 400px; overflow-y: scroll; }
      .message { margin-bottom: 10px; }
      .user { color: blue; }
      .assistant { color: green; }
    </style>
  </head>
  <body>
    <h1>Project Manager Chat Interface</h1>
    <div class="chat-box">
      {% for msg in history %}
        <div class="message">
          <strong class="{{ msg.role }}">{{ msg.role }}:</strong>
          <pre style="white-space: pre-wrap;">{{ msg.content }}</pre>
        </div>
      {% endfor %}
    </div>
    <hr>
    <form method="post">
      <textarea name="prompt" rows="5" cols="60" placeholder="Enter your prompt here..."></textarea><br>
      <input type="submit" value="Submit">
    </form>
  </body>
</html>
'''

# In-memory chat history.
chat_history = []

def extract_code(text):
    """
    Extracts text enclosed in triple backticks (optionally with a language hint)
    and returns the contents. If none is found, returns the entire text.
    """
    match = re.search(r"```(?:python)?\n(.*?)```", text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return text.strip()

def extract_diff_and_commit_summary(text):
    """
    Assumes the API output includes a code block with a unified diff followed
    by a line that starts with "Commit Summary:".
    """
    diff = extract_code(text)
    commit_summary = None
    match = re.search(r"Commit Summary:\s*(.*)", text)
    if match:
        commit_summary = match.group(1).strip()
    return diff, commit_summary

def apply_diff(diff_text, source_file):
    """
    Uses the system patch command to apply a unified diff to source_file.
    The diff_text should be in a proper unified diff format.
    """
    try:
        result = subprocess.run(
            ["patch", source_file],
            input=diff_text.encode(),
            capture_output=True,
            check=True
        )
        return True, result.stdout.decode() + result.stderr.decode()
    except subprocess.CalledProcessError as e:
        return False, e.stdout.decode() + e.stderr.decode()

def commit_changes(source_file, commit_message):
    """
    Adds the modified file to git and commits with the given commit message.
    """
    try:
        subprocess.run(["git", "add", source_file], check=True)
        subprocess.run(["git", "commit", "-m", commit_message], check=True)
        return True
    except subprocess.CalledProcessError:
        return False

# Create the Flask app.
app = Flask(__name__)

@app.route("/", methods=["GET", "POST"])
def index():
    global chat_history, SOURCE_FILE

    if request.method == "POST":
        user_prompt = request.form["prompt"]
        chat_history.append({"role": "User", "content": user_prompt})

        # Check if the file is empty or does not exist.
        first_request = not os.path.exists(SOURCE_FILE) or os.path.getsize(SOURCE_FILE) == 0

        # Depending on whether this is the first run or a subsequent update,
        # instruct the API to output full code or a unified diff.
        if first_request:
            system_prompt = (
                "You are an assistant that helps manage a software project. "
                "When given a prompt, generate the complete code for the project file. "
                "Output only the code in a single Python code block (using triple backticks)."
            )
        else:
            system_prompt = (
                f"You are an assistant that helps manage a software project. "
                f"The current file ({SOURCE_FILE}) already has code. "
                "When given a prompt for changes, generate a unified diff (patch format) that "
                "modifies only the necessary parts of the code. Output the diff in a Python code block "
                "using triple backticks. Then, on a new line, output a commit summary that starts with "
                "'Commit Summary:' followed by a brief description of the changes."
            )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]

        try:
            response = client.chat.completions.create(model="o3-mini",
            messages=messages,
            temperature=0)
        except Exception as e:
            chat_history.append({"role": "Assistant", "content": f"Error calling OpenAI API: {str(e)}"})
            return render_template_string(HTML_TEMPLATE, history=chat_history)

        reply = response.choices[0].message.content
        chat_history.append({"role": "Assistant", "content": reply})

        if first_request:
            # For the first request, write the complete code to the file.
            code = extract_code(reply)
            with open(SOURCE_FILE, "w") as f:
                f.write(code)
        else:
            # For subsequent requests, extract the diff and commit summary.
            diff, commit_summary = extract_diff_and_commit_summary(reply)
            success, patch_output = apply_diff(diff, SOURCE_FILE)
            if not success:
                chat_history.append({"role": "Assistant", "content": f"Error applying diff: {patch_output}"})
            else:
                commit_msg = commit_summary if commit_summary else f"Applied changes: {user_prompt}"
                if not commit_changes(SOURCE_FILE, commit_msg):
                    chat_history.append({"role": "Assistant", "content": "Error committing changes to git."})

        return render_template_string(HTML_TEMPLATE, history=chat_history)

    return render_template_string(HTML_TEMPLATE, history=chat_history)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Manage a software project via ChatGPT API.")
    parser.add_argument("source_file", help="Path to the source code file to manage.")
    args = parser.parse_args()

    SOURCE_FILE = args.source_file
    # Create an empty file if it doesn't exist.
    if not os.path.exists(SOURCE_FILE):
        open(SOURCE_FILE, "w").close()

    # Start the Flask web server on port 5000.
    app.run(port=5000)

