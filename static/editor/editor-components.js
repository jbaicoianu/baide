// CSS for Custom Baide Elements:
/* 
.baide-editor {
  display: flex;
  flex-direction: row;
  height: 100vh;
}

.baide-editor-code {
  flex: 1;
  position: relative;
}

.baide-project-tree {
  width: 250px;
  border-right: 1px solid #ccc;
  overflow-y: auto;
}

.baide-project-selector,
.baide-branch-selector,
.baide-file-tabs,
.baide-context-selector,
.baide-chat {
  padding: 10px;
}

.baide-chat-history {
  height: 70%;
  overflow-y: auto;
}

.baide-chat-input {
  position: absolute;
  bottom: 0;
  width: 100%;
}

.toast {
  min-width: 200px;
  padding: 10px 20px;
  border-radius: 5px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  opacity: 0;
  transition: opacity 0.5s;
  cursor: pointer;
}

.toast.success {
  background-color: #4CAF50;
}

.toast.error {
  background-color: #f44336;
}

.toast.info {
  background-color: #333;
}

.hidden {
  display: none;
}
*/

// Existing global variables
let activeFile = {}; // Mapping of project name to active file
let openFiles = {}; // Mapping of project name to open files
let editor = null;
let openDirectories = new Map(); // Mapping of project name to open directories
let fileCodingContexts = {}; // Mapping of filename to contexts
let allCodingContexts = []; // All available coding contexts
let fileActiveModels = {}; // Mapping of filename to active model
let availableModels = []; // List of available AI models
let defaultModel = ''; // Default AI model
let lastSearchQuery = '';
let searchCursor = null;
let searchDirection = 'forward'; // New variable to track search direction
let totalSearchResults = 0;
let currentSearchIndex = 0;
let searchResults = []; // Array to store all search match positions
let currentProject = ''; // Variable to track the current project

// Define <baide-editor> custom element
class BaideEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <div class="baide-editor">
        <baide-project-tree></baide-project-tree>
        <div style="flex: 1; display: flex; flex-direction: column;">
          <baide-file-tabs></baide-file-tabs>
          <baide-editor-code></baide-editor-code>
          <baide-chat></baide-chat>
        </div>
      </div>
    `;
  }

  connectedCallback() {
    // Initialize components if needed
  }
}

customElements.define('baide-editor', BaideEditor);

// Define <baide-project-tree> custom element
class BaideProjectTree extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <div class="baide-project-tree">
        <baide-project-selector></baide-project-selector>
        <baide-branch-selector></baide-branch-selector>
        <button id="newProjectBtn">New Project</button>
        <button id="newFileBtn">New File</button>
        <div id="projectTreeContainer"></div>
      </div>
    `;
  }

  connectedCallback() {
    this.shadowRoot.getElementById('newProjectBtn').addEventListener('click', openNewProjectModal);
    this.shadowRoot.getElementById('newFileBtn').addEventListener('click', openNewFileModal);
    loadProjectStructure();
  }
}

customElements.define('baide-project-tree', BaideProjectTree);

// Define <baide-project-selector> custom element
class BaideProjectSelector extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <select id="projectSelector">
        <option value="">Select Project</option>
      </select>
    `;
  }

  connectedCallback() {
    const selector = this.shadowRoot.getElementById('projectSelector');
    fetch('/projects/list')
      .then(response => response.json())
      .then(data => {
        const projects = data.projects; // Adjusted to access the 'projects' array
        projects.forEach(project => {
          const option = document.createElement('option');
          option.value = project;
          option.textContent = project;
          selector.appendChild(option);
        });
        selector.value = currentProject;
      })
      .catch(error => {
        console.error('Error fetching project list:', error);
      });

    selector.addEventListener('change', (e) => {
      const selectedProject = e.target.value;
      if (selectedProject) {
        switchProject(selectedProject);
      }
    });
  }
}

customElements.define('baide-project-selector', BaideProjectSelector);

// Define <baide-branch-selector> custom element
class BaideBranchSelector extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <div id="gitBranchDisplay">Loading branch...</div>
      <div id="branchPopup" class="hidden">
        <div class="branch-popup-content">
          <div id="branchList"></div>
          <button id="addBranchBtn">Add New Branch</button>
        </div>
      </div>
    `;
  }

  connectedCallback() {
    this.loadGitBranch();
    this.shadowRoot.getElementById('gitBranchDisplay').addEventListener('click', () => this.openBranchPopup());

    // Add event listener for adding a new branch
    this.shadowRoot.getElementById('addBranchBtn').addEventListener('click', () => this.showAddBranchInput());

    // Add event listener to close popup when clicking outside the content
    this.shadowRoot.getElementById('branchPopup').addEventListener('click', (event) => {
      if (event.target === this.shadowRoot.getElementById('branchPopup')) {
        this.shadowRoot.getElementById('branchPopup').classList.add('hidden');
      }
    });
  }

  async loadGitBranch() {
    try {
      const response = await fetch('/git_current_branch?project_name=' + currentProject);
      if (response.ok) {
        const data = await response.json();
        const gitBranchDiv = this.shadowRoot.getElementById('gitBranchDisplay');
        gitBranchDiv.textContent = `${data.current_branch}`;
      } else {
        console.error('Failed to load current Git branch.');
      }
    } catch (e) {
      console.error('Error loading Git branch:', e);
    }
  }

  async openBranchPopup() {
    const popup = this.shadowRoot.getElementById('branchPopup');
    popup.classList.toggle('hidden');

    if (!popup.classList.contains('hidden')) {
      // Fetch and display branches
      try {
        const response = await fetch('/git_branches?project_name=' + currentProject);
        if (response.ok) {
          const data = await response.json();
          const branchList = this.shadowRoot.getElementById('branchList');
          branchList.innerHTML = '';
          const currentBranch = this.shadowRoot.getElementById('gitBranchDisplay').textContent;
          data.branches.forEach(branch => {
            const branchItem = document.createElement('div');
            branchItem.className = 'branchItem';
            if (branch === currentBranch) {
              branchItem.classList.add('active-branch');
            }
            branchItem.textContent = branch;
            branchItem.addEventListener('click', () => this.switchBranch(branch));
            branchList.appendChild(branchItem);
          });
        } else {
          console.error('Failed to load Git branches.');
        }
      } catch (e) {
        console.error('Error loading Git branches:', e);
      }
    }
  }

  async switchBranch(branchName) {
    try {
      const response = await fetch('/git_switch_branch', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ branch: branchName, project_name: currentProject })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          showToast(`Switched to branch ${branchName}`, 'success');
          this.loadGitBranch();
          await loadProjectStructure();
        } else {
          showToast(`Error switching branch: ${data.error}`, 'error');
        }
      } else {
        console.error('Failed to switch branch.');
      }
    } catch (e) {
      console.error('Error switching branch:', e);
    }
      
    // Hide the popup after switching
    this.shadowRoot.getElementById('branchPopup').classList.add('hidden');
  }

  showAddBranchInput() {
    const branchList = this.shadowRoot.getElementById('branchList');
        
    // Create input field
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'newBranchName';
    input.placeholder = 'Enter new branch name';
        
    // Create submit button
    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Create';
    submitBtn.addEventListener('click', () => this.addNewBranch());
        
    // Append to branch list
    branchList.appendChild(input);
    branchList.appendChild(submitBtn);
        
    // Automatically focus on the new branch name input box
    input.focus();
    
    // Add event listener for Enter key to submit the branch
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.addNewBranch();
      }
    });
      
    /*
    CSS for Add Branch Input:
    #newBranchName {
      width: 100%;
      padding: 8px;
      margin-top: 10px;
      box-sizing: border-box;
    }
    */
  }

  async addNewBranch() {
    const branchName = this.shadowRoot.getElementById('newBranchName').value.trim();
    if (!branchName) {
      showToast('Branch name cannot be empty.', 'error');
      return;
    }
      
    try {
      const response = await fetch('/git_create_branch', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ branch: branchName, project_name: currentProject })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          showToast(`Branch ${branchName} created successfully.`, 'success');
          this.loadGitBranch();
          // Refresh branch list
          this.openBranchPopup();
        } else {
          showToast(`Error creating branch: ${data.error}`, 'error');
        }
      } else {
        console.error('Failed to create branch.');
      }
    } catch (e) {
      console.error('Error creating branch:', e);
    }
  }
}

customElements.define('baide-branch-selector', BaideBranchSelector);

// Define <baide-file-tabs> custom element
class BaideFileTabs extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <div id="tabs" class="baide-file-tabs">
        <!-- Tabs will be populated here -->
        <div class="tab more-tabs">>> 
          <div class="dropdown-content hidden"></div>
        </div>
      </div>
    `;
  }

  connectedCallback() {
    adjustTabs();
  }
}

customElements.define('baide-file-tabs', BaideFileTabs);

// Define <baide-editor-code> custom element
class BaideEditorCode extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <textarea id="sourceCode"></textarea>
      <img id="imageDisplay" style="max-width: 100%; display: none;" />
      <div id="searchOverlay" class="hidden">
        <input type="text" id="searchInput" placeholder="Search..." />
        <button id="searchButton">Search</button>
        <span id="closeSearchButton">✖</span>
        <span id="searchIndicator">0 / 0</span>
      </div>
      <div id="commitMessageOverlay" class="hidden">
        <!-- Commit message content -->
      </div>
    `;
  }

  connectedCallback() {
    initializeCodeMirror();
    // Additional event listeners and initialization
  }
}

customElements.define('baide-editor-code', BaideEditorCode);

// Define <baide-chat> custom element
class BaideChat extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <div class="baide-chat">
        <baide-chat-history></baide-chat-history>
        <baide-chat-input></baide-chat-input>
      </div>
    `;
  }

  connectedCallback() {
    // Initialize chat functionality
    setupEventListeners();
  }
}

customElements.define('baide-chat', BaideChat);

// Define <baide-chat-history> custom element
class BaideChatHistory extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <div id="chatBox"></div>
      <div id="commitSummaries"></div>
      <div id="activeCodingContexts"></div>
    `;
  }

  connectedCallback() {
    loadTranscript(activeFile[currentProject]);
  }

  // Methods to append messages, commit summaries, etc.
}

customElements.define('baide-chat-history', BaideChatHistory);

// Define <baide-chat-input> custom element
class BaideChatInput extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <form id="chatForm">
        <input type="text" id="promptInput" placeholder="Enter your prompt..." />
        <button type="submit">Send</button>
        <div id="throbber" style="display: none;">Loading...</div>
      </form>
    `;
  }

  connectedCallback() {
    const chatForm = this.shadowRoot.getElementById('chatForm');
    const promptInput = this.shadowRoot.getElementById('promptInput');
    const throbber = this.shadowRoot.getElementById('throbber');

    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentProject || !activeFile[currentProject]) return;
      const filename = activeFile[currentProject];
      const prompt = promptInput.value.trim();
      if (!prompt) return;
      appendMessage("User", prompt);
      scrollToBottom(this.shadowRoot.getElementById('chatBox'));
      promptInput.value = "";
      throbber.style.display = "block";

      // Store the currently active file when the request is sent
      const requestedFile = activeFile[currentProject];

      // Gather active context names
      const contexts = fileCodingContexts[filename] ? fileCodingContexts[filename].map(ctx => ctx.name) : [];

      // Get active AI model for the current file
      const activeModel = fileActiveModels[filename] || defaultModel;

      try {
        const response = await fetch("/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: prompt, file: filename, contexts: contexts, model: activeModel, project_name: currentProject })
        });
        if (response.ok) {
          const data = await response.json();
          updateChatHistoryViewer(data.chat_histories);
          scrollToBottom(this.shadowRoot.getElementById('chatBox'));
          scrollToBottom(this.shadowRoot.getElementById('commitSummaries'));
          // Reload the source code after AI updates only if the active file hasn't changed
          if (activeFile[currentProject] === requestedFile) {
            await loadSourceCode(filename);
          }
          // Reload coding contexts
          loadFileCodingContexts(filename);
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

    // Listen for Ctrl+Enter to submit the form.
    promptInput.addEventListener("keydown", function(e) {
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        chatForm.dispatchEvent(new Event("submit", {cancelable: true}));
      }
    });
  }
}

customElements.define('baide-chat-input', BaideChatInput);

// Define other custom elements like <baide-context-selector> as needed...

// Retain existing functions that do not fit into custom elements

// Initialize CodeMirror editor
function initializeCodeMirror() {
  const textarea = document.getElementById('sourceCode') || document.querySelector('baide-editor-code #sourceCode');
  editor = CodeMirror.fromTextArea(textarea, {
    mode: 'python',
    theme: 'dracula',
    lineNumbers: true,
    lineWrapping: true,
    tabSize: 4,
    indentUnit: 4,
    extraKeys: {
      "Ctrl-S": function(cm) {
        promptCommitMessage();
      },
      "Ctrl-F": function(cm) {
        openSearchOverlay(cm);
      },
      "Ctrl-G": function(cm) { // Added Ctrl+G shortcut for forward search
        if (lastSearchQuery) {
          performSearch(cm, lastSearchQuery, 'forward');
          updateSearchIndicator();
        }
      },
      "Ctrl-Shift-G": function(cm) { // Added Ctrl+Shift-G shortcut for backward search
        if (lastSearchQuery) {
          performSearch(cm, lastSearchQuery, 'reverse');
          updateSearchIndicator();
        }
      }
    }
  });
}

// ... [Rest of the existing functions remain unchanged]

window.onload = async function() {
  // Initialize custom editor component
  const editorComponent = document.createElement('baide-editor');
  document.body.appendChild(editorComponent);

  // Load other initializations
  loadFileCodingContextsFromStorage();
  loadFileActiveModelsFromStorage();
  
  // Fetch all coding contexts on load
  try {
    const response = await fetch('/coding_contexts');
    if (response.ok) {
      const data = await response.json();
      allCodingContexts = data; // Updated to handle array of context objects
      updateContextSelectorOptions();
    } else {
      console.error('Failed to fetch coding contexts.');
    }
  } catch (e) {
    console.error('Error fetching coding contexts:', e);
  }

  // Load AI Models after creating the dropdown
  await loadAIModals();
  
  loadCurrentProject();
  await loadProjectStructure();
  await restoreProjectState(currentProject);
  adjustTabs(); // Initial adjustment

  // Check if there are no open files and show placeholder if necessary
  if (!activeFile[currentProject] || Object.keys(openFiles[currentProject]).length === 0) {
    showPlaceholderPage();
  } else {
    hidePlaceholderPage();
  }
};