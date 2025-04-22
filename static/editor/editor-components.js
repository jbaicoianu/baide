// CSS for Custom Baide Elements:
const globalStyle = document.createElement('style');
globalStyle.textContent = `
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
`;
document.head.appendChild(globalStyle);

// Define <baide-toast> custom element
class BaideToast extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style> @import "editor.css"; </style>
      <div id="toastContainer" class="toast-container"></div>
      <style>
        .toast-container {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 10000;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .toast {
          min-width: 200px;
          padding: 10px 20px;
          border-radius: 5px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
          opacity: 0;
          transition: opacity 0.5s;
          cursor: pointer;
          color: white;
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
      </style>
    `;
  }

  connectedCallback() {
    // Initialize if needed
  }

  show(message, type = 'info') {
    const toastContainer = this.shadowRoot.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    // Append toast to container
    toastContainer.appendChild(toast);
    
    // Show the toast
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
    });
    
    // Remove the toast after 5 seconds
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => {
        toast.remove();
      }, 500);
    }, 5000);
    
    // Allow manual removal on click
    toast.addEventListener('click', () => {
      toast.style.opacity = '0';
      setTimeout(() => {
        toast.remove();
      }, 500);
    });
  }
}

customElements.define('baide-toast', BaideToast);

// Define <baide-placeholder-page> custom element
class BaidePlaceholderPage extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style> @import "editor.css"; </style>
      <div class="placeholder-container">
        <h2>Welcome to Your New Project</h2>
        <p>Please create or open files using the project browser pane on the left.</p>
        <p>Getting started:</p>
        <ul>
          <li>Click the "New File" button to create a new file.</li>
          <li>Select an existing file from the project browser to open it.</li>
        </ul>
      </div>
      <style>
        .placeholder-container {
          padding: 20px;
          text-align: center;
          color: #555;
        }
      </style>
    `;
  }

  connectedCallback() {
    // Initialize if needed
  }
}

customElements.define('baide-placeholder-page', BaidePlaceholderPage);

// Define <baide-editor> custom element
class BaideEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style> @import "editor.css"; </style>
      <div class="baide-editor" id="container">
        <div id="projectBrowser">
          <baide-project-tree></baide-project-tree>
        </div>
        <div id="mainContent">
          <baide-file-tabs></baide-file-tabs>
          <baide-editor-code></baide-editor-code>
          <baide-chat></baide-chat>
        </div>
      </div>
    `;

    // Initialize member variables
    this.activeFile = {}; // Mapping of project name to active file
    this.openFiles = {}; // Mapping of project name to open files
    this.openDirectories = new Map(); // Mapping of project name to open directories
    this.fileCodingContexts = {}; // Mapping of filename to coding contexts
    this.fileActiveModels = {}; // Mapping of filename to active AI models
    this.currentProject = ''; // Current project name
    this.editor = null; // CodeMirror editor instance
    this.defaultModel = 'default-model'; // Replace with actual default model
  }

  connectedCallback() {
    // Listen for project-changed event to save state
    this.addEventListener('project-changed', (e) => {
      const projectName = e.detail.projectName;
      this.saveProjectState(this.currentProject);
      this.currentProject = projectName;
    });

    // Listen for project-loaded event to restore state
    this.addEventListener('project-loaded', (e) => {
      const projectName = e.detail.projectName;
      this.restoreProjectState(projectName);
    });

    // Initialize currentProject from localStorage or default
    this.currentProject = localStorage.getItem('currentProject') || '';

    // If there's a current project, restore its state
    if (this.currentProject) {
      this.restoreProjectState(this.currentProject);
    }

    // Listen for tab-related events from <baide-file-tabs>
    const fileTabs = this.shadowRoot.querySelector('baide-file-tabs');
    if (fileTabs) {
      fileTabs.addEventListener('close-all-tabs', () => this.closeAllTabs());
      fileTabs.addEventListener('close-tab', (e) => this.closeTab(e.detail.filename));
      fileTabs.addEventListener('open-file-in-tab', (e) => this.openFileInTab(e.detail.filename, e.detail.activate));
      fileTabs.addEventListener('switch-to-tab', (e) => this.switchToTab(e.detail.filename));
    }

    // Initialize CodeMirror editor after <baide-editor-code> is ready
    const editorCode = this.shadowRoot.querySelector('baide-editor-code');
    if (editorCode) {
      editorCode.initializeEditor((cm) => {
        this.editor = cm;
      });
    }

    // Listen for 'file-selected' events from <baide-project-tree>
    this.addEventListener('file-selected', (e) => {
      const { projectName, filePath } = e.detail;
      if (projectName === this.currentProject) {
        this.openFileInTab(filePath);
      } else {
        // Optionally handle project switching here if needed
        // For now, just open the file
        this.openFileInTab(filePath);
      }
    });
  }

  // Member function to show the placeholder page
  showPlaceholderPage() {
    // Hide relevant components
    const fileTabs = this.shadowRoot.querySelector('baide-file-tabs');
    const editorCode = this.shadowRoot.querySelector('baide-editor-code');
    const chat = this.shadowRoot.querySelector('baide-chat');

    if (fileTabs) fileTabs.classList.add('hidden');
    if (editorCode) editorCode.classList.add('hidden');
    if (chat) chat.classList.add('hidden');

    // Add the placeholder page if not already present
    if (!this.shadowRoot.querySelector('baide-placeholder-page')) {
      const placeholder = document.createElement('baide-placeholder-page');
      this.shadowRoot.querySelector('.baide-editor').appendChild(placeholder);
    }
  }

  // Member function to hide the placeholder page
  hidePlaceholderPage() {
    // Show relevant components
    const fileTabs = this.shadowRoot.querySelector('baide-file-tabs');
    const editorCode = this.shadowRoot.querySelector('baide-editor-code');
    const chat = this.shadowRoot.querySelector('baide-chat');

    if (fileTabs) fileTabs.classList.remove('hidden');
    if (editorCode) editorCode.classList.remove('hidden');
    if (chat) chat.classList.remove('hidden');

    // Remove the placeholder page if present
    const placeholder = this.shadowRoot.querySelector('baide-placeholder-page');
    if (placeholder) {
      placeholder.remove();
    }
  }

  // Function to save the state of a project
  saveProjectState(projectName) {
    if (!projectName) return;
    // Save open files
    localStorage.setItem(`openFiles_${projectName}`, JSON.stringify(this.openFiles[projectName] || {}));
    // Save active file
    localStorage.setItem(`activeFile_${projectName}`, this.activeFile[projectName] || '');
    // Save open directories
    localStorage.setItem(`openDirectories_${projectName}`, JSON.stringify(Array.from(this.openDirectories.get(projectName) || [])));
    // Save file coding contexts
    localStorage.setItem(`fileCodingContexts_${projectName}`, JSON.stringify(this.fileCodingContexts));
    // Save file active models
    localStorage.setItem(`fileActiveModels_${projectName}`, JSON.stringify(this.fileActiveModels));
  }

  // Function to restore the state of a project
  async restoreProjectState(projectName) {
    if (!projectName) return;
    // Load open files
    const storedOpenFiles = localStorage.getItem(`openFiles_${projectName}`);
    this.openFiles[projectName] = storedOpenFiles ? JSON.parse(storedOpenFiles) : {};

    // Load active file
    this.activeFile[projectName] = localStorage.getItem(`activeFile_${projectName}`) || '';

    // Load open directories
    const storedOpenDirs = localStorage.getItem(`openDirectories_${projectName}`);
    this.openDirectories.set(projectName, storedOpenDirs ? new Set(JSON.parse(storedOpenDirs)) : new Set());

    // Load file coding contexts
    const storedCodingContexts = localStorage.getItem(`fileCodingContexts_${projectName}`);
    this.fileCodingContexts = storedCodingContexts ? JSON.parse(storedCodingContexts) : {};

    // Load file active models
    const storedActiveModels = localStorage.getItem(`fileActiveModels_${projectName}`);
    this.fileActiveModels = storedActiveModels ? JSON.parse(storedActiveModels) : {};

    // Close all current tabs
    await this.closeAllTabs();

    // Open files for the new project
    for (const filename of Object.keys(this.openFiles[projectName])) {
      await this.openFileInTab(filename, false);
    }

    // Switch to active file
    if (this.activeFile[projectName]) {
      await this.switchToTab(this.activeFile[projectName]);
    } else {
      // If no active file, clear the editor and show placeholder
      this.clearEditor();
      this.showPlaceholderPage();
    }

    this.adjustTabs(); // Adjust tabs after restoring
  }

  // Function to close all open tabs
  async closeAllTabs() {
    if (!this.currentProject) return;
    const filenames = Object.keys(this.openFiles[this.currentProject] || {});
    for (const filename of filenames) {
      await this.closeTab(filename);
    }
  }

  // Function to close a specific tab
  async closeTab(filename) {
    if (!this.currentProject) return;

    const sanitizedId = sanitizeId(filename);
    const tabElement = this.shadowRoot.querySelector(`baide-file-tabs #tab-${sanitizedId}`);
    if (tabElement) {
      tabElement.remove();
      delete this.openFiles[this.currentProject][filename];
      this.saveProjectState(this.currentProject);
      // Remove coding contexts for the closed file
      delete this.fileCodingContexts[filename];
      this.saveProjectState(this.currentProject);
      // Remove active model for the closed file
      delete this.fileActiveModels[filename];
      this.saveProjectState(this.currentProject);
      // If the closed tab was active, switch to another tab
      if (this.activeFile[this.currentProject] === filename) {
        const remainingTabs = this.shadowRoot.querySelectorAll(`baide-file-tabs .tab`);
        if (remainingTabs.length > 0) {
          const newActiveTab = remainingTabs[remainingTabs.length - 1];
          const newActiveFilename = newActiveTab.textContent.slice(0, -1); // Remove close button
          await this.switchToTab(newActiveFilename);
        } else {
          this.activeFile[this.currentProject] = undefined;
          this.saveProjectState(this.currentProject);
          this.clearEditor();
          if (this.editor) {
            this.editor.setValue('');
          }
          const imageDisplay = document.getElementById('imageDisplay');
          if (imageDisplay) {
            imageDisplay.style.display = 'none';
          }
            /*
          document.getElementById('chatBox').innerHTML = '';
          document.getElementById('commitSummaries').innerHTML = '';
          document.getElementById('activeCodingContexts').innerHTML = '';
          // Reset AI model dropdown
          resetAIDropdown();
          // Show the placeholder page since there are no open files
          this.showPlaceholderPage();
            */
        }
        this.adjustTabs(); // Adjust tabs after closing a tab
      }
    }
  }

  // Function to open a file in a new tab
  async openFileInTab(filename, activate = true) {
    if (!this.currentProject) return;

    // Initialize openFiles for the project if not present
    if (!this.openFiles[this.currentProject]) {
      this.openFiles[this.currentProject] = {};
    }

    // Check if the tab already exists in the DOM
    const existingTab = this.shadowRoot.querySelector(`baide-file-tabs #tab-${sanitizeId(filename)}`);
    if (existingTab) {
      if (activate) {
        await this.switchToTab(filename);
      }
      return;
    }
    if (!activate) return;
                                                      
    try {
      const response = await fetch(`/file?file=${encodeURIComponent(filename)}&project_name=${encodeURIComponent(this.currentProject)}`);
      if (response.ok) {
        const contentType = response.headers.get('Content-Type');
        // Create a new tab via <baide-file-tabs>
        const fileTabs = this.shadowRoot.querySelector('baide-file-tabs');
        if (fileTabs) {
          await fileTabs.addTab(filename, async () => {
            await this.switchToTab(filename);
          }, async () => {
            await this.closeTab(filename);
          });
        }

        if (activate) {
          // Activate the new tab
          await this.switchToTab(filename);
        } else {
          //this.openFiles[this.currentProject][filename] = true;
          //this.saveProjectState(this.currentProject);
        }
      }
    } catch (e) {
      console.error('Error opening file:', e);
      showToast('Error opening file.', 'error');
    }
  }

  // Function to switch to a specific tab
  async switchToTab(filename) {
    if (!this.currentProject) return;

    // Deactivate other tabs
    const fileTabs = this.shadowRoot.querySelector('baide-file-tabs');
    if (fileTabs) {
      fileTabs.setActiveTab(filename);
    }

    try {
      const response = await fetch(`/file?file=${encodeURIComponent(filename)}&project_name=${encodeURIComponent(this.currentProject)}`);
      if (response.ok) {
        const contentType = response.headers.get('Content-Type');
        if (contentType === 'application/json') {
          const content = await response.json();
          const prettyJson = JSON.stringify(content, null, 2);
          this.setEditorValue(prettyJson, { name: 'javascript', json: true }); // Updated mode configuration
          this.editor.getWrapperElement().style.display = 'block';
          //document.getElementById('imageDisplay').style.display = 'none';
        } else if (contentType.startsWith('text/')) {
          const content = await response.text();
          this.setEditorValue(content, 'python');
          this.editor.getWrapperElement().style.display = 'block';
          //document.getElementById('imageDisplay').style.display = 'none';
        } else if (contentType.startsWith('image/')) {
          const blob = await response.blob();
          const imageUrl = URL.createObjectURL(blob);
          let imageDisplay = document.getElementById('imageDisplay');
          if (!imageDisplay) {
            const container = document.getElementById('sourceCodeContainer');
            const img = document.createElement('img');
            img.id = 'imageDisplay';
            img.style.maxWidth = '100%';
            img.style.display = 'none';
            container.appendChild(img);
            imageDisplay = img;
          }
          imageDisplay.src = imageUrl;
          imageDisplay.style.display = 'block';
          this.editor.getWrapperElement().style.display = 'none';
        }

        this.activeFile[this.currentProject] = filename;
        this.openFiles[this.currentProject][filename] = true;
        this.saveProjectState(this.currentProject);
        // Load transcript
        await this.loadTranscript(filename);
        // Load coding contexts
        this.loadFileCodingContexts(filename);
        // Load active AI model
        this.loadFileActiveModel(filename);
        // Adjust tabs
        this.adjustTabs(); // Adjust tabs after adding a new tab

        // Hide the "more tabs" dropdown
        const moreDropdown = fileTabs.shadowRoot.querySelector('.dropdown-content');
        if (moreDropdown) {
          moreDropdown.classList.remove('show');
        }
        
        // Hide the placeholder if it's visible
        this.hidePlaceholderPage();
      } else {
        showToast('Failed to load file content.', 'error');
        console.error('Failed to load file content.');
      }
    } catch (e) {
      console.error('Error switching to tab:', e);
      showToast('Error switching to tab.', 'error');
    }
  }

  // Function to adjust tabs (implementation depends on <baide-file-tabs>)
  adjustTabs() {
    const fileTabs = this.shadowRoot.querySelector('baide-file-tabs');
    if (fileTabs) {
      fileTabs.adjustTabs();
    }
  }

  // Function to load transcript (to be implemented)
  async loadTranscript(filename) {
    // TODO: Implement loadTranscript functionality
  }

  // Function to load coding contexts (to be implemented)
  loadFileCodingContexts(filename) {
    // TODO: Implement loadFileCodingContexts functionality
  }

  // Function to load active AI model (to be implemented)
  loadFileActiveModel(filename) {
    // TODO: Implement loadFileActiveModel functionality
  }

  // Member function to set editor value
  setEditorValue(value, mode = 'python') {
    const editorCode = this.shadowRoot.querySelector('baide-editor-code');
    if (editorCode) {
      editorCode.setEditorValue(value, mode);
    }
  }

  // Member function to clear the editor
  clearEditor() {
    this.setEditorValue('');
  }

  // Member function to create the project tree
  createProjectTree(structure, parentElement, currentPath = '') {
    const directories = structure.filter(item => item.type === 'directory');
    const files = structure.filter(item => item.type === 'file');
      
    directories.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
      
    directories.forEach(dir => {
      const itemDiv = document.createElement('div');
      const dirSpan = document.createElement('span');
      dirSpan.textContent = dir.name;
      if (dir.name.startsWith('.')) {
        dirSpan.classList.add('hiddenfile');
      }
      dirSpan.addEventListener('click', () => {
        childContainer.classList.toggle('hidden');
        dirSpan.classList.toggle('open');
        const fullPath = currentPath + dir.name + '/';
        const editor = this.closest('baide-editor');
        if (editor) {
          if (childContainer.classList.contains('hidden')) {
            editor.openDirectories.get(this.currentproject).delete(fullPath);
          } else {
            editor.openDirectories.get(this.currentproject).add(fullPath);
          }
          editor.saveProjectState(this.currentproject);
          editor.adjustTabs(); // Adjust tabs when directories are toggled
        }
      });
      itemDiv.className = 'directory';
      itemDiv.appendChild(dirSpan);
      const childContainer = document.createElement('div');
      childContainer.className = 'directory-children hidden';
      // Recursively create tree with updated path
      this.createProjectTree(dir.children, childContainer, currentPath + dir.name + '/');
      itemDiv.appendChild(childContainer);
      parentElement.appendChild(itemDiv);
    });
      
    files.forEach(file => {
      const itemDiv = document.createElement('div');
      const fileSpan = document.createElement('span');
      fileSpan.textContent = file.name;
      fileSpan.className = 'file';
      if (file.name.startsWith('.')) {
        fileSpan.classList.add('hiddenfile');
      }
      const fullPath = currentPath + file.name;
      fileSpan.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('file-selected', {
          detail: {
            projectName: this.currentproject,
            filePath: fullPath
          },
          bubbles: true,
          composed: true
        }));
      });
      itemDiv.appendChild(fileSpan);
      parentElement.appendChild(itemDiv);
    });
  }
}

customElements.define('baide-editor', BaideEditor);

// Define <baide-file-tabs> custom element
class BaideFileTabs extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style> @import "editor.css"; </style>
      <div id="tabs" class="baide-file-tabs">
        <!-- Tabs will be populated here -->
        <div class="tab more-tabs">>> 
          <div class="dropdown-content hidden"></div>
        </div>
      </div>
      <style>
        .baide-file-tabs {
          display: flex;
          align-items: center;
          overflow-x: auto;
          white-space: nowrap;
        }
        .tab {
          padding: 10px;
          cursor: pointer;
          position: relative;
          user-select: none;
        }
        .tab.active {
          background-color: #ddd;
        }
        .close-btn {
          margin-left: 5px;
          color: red;
          cursor: pointer;
        }
        .more-tabs {
          position: relative;
        }
        .dropdown-content {
          position: absolute;
          top: 100%;
          left: 0;
          background-color: #f9f9f9;
          min-width: 160px;
          box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);
          z-index: 1;
        }
        .dropdown-content .tab {
          display: block;
        }
        .hidden {
          display: none;
        }
      </style>
    `;
  }

  connectedCallback() {
    // Initial setup if needed
  }

  // Method to add a new tab
  async addTab(filename, onActivate, onClose) {
    const tabsContainer = this.shadowRoot.getElementById('tabs');
    const sanitizedId = sanitizeId(filename);
    const existingTab = this.shadowRoot.getElementById(`tab-${sanitizedId}`);
    if (existingTab) return;

    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.id = `tab-${sanitizedId}`;
    tab.textContent = filename;

    const closeBtn = document.createElement('span');
    closeBtn.className = 'close-btn';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dispatchEvent(new CustomEvent('close-tab', {
        detail: { filename },
        bubbles: true,
        composed: true
      }));
    });
    tab.appendChild(closeBtn);

    tab.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('switch-to-tab', {
        detail: { filename },
        bubbles: true,
        composed: true
      }));
      onActivate();
    });

    // Insert before 'moreTabs'
    const moreTabs = this.shadowRoot.querySelector('.more-tabs');
    tabsContainer.insertBefore(tab, moreTabs);
  }

  // Method to set a tab as active
  setActiveTab(filename) {
    const allTabs = this.shadowRoot.querySelectorAll('.tab');
    allTabs.forEach(tab => {
      if (tab.id === `tab-${sanitizeId(filename)}`) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });
  }

  // Method to close all tabs
  closeAllTabs() {
    this.dispatchEvent(new CustomEvent('close-all-tabs', {
      bubbles: true,
      composed: true
    }));
  }

  // Placeholder for adjustTabs functionality
  adjustTabs() {
    // TODO: Implement adjustTabs functionality
  }
}

customElements.define('baide-file-tabs', BaideFileTabs);

// Define <baide-editor-code> custom element
class BaideEditorCode extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style> @import "editor.css"; </style>
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
      <style>
        /* Add necessary styles */
      </style>
    `;
  }

  connectedCallback() {
    // Additional event listeners and initialization if needed
  }

  // Method to initialize CodeMirror editor and pass the instance back to <baide-editor>
  initializeEditor(callback) {
    const textarea = this.shadowRoot.getElementById('sourceCode');
    this.editor = CodeMirror.fromTextArea(textarea, {
      mode: 'python',
      theme: 'dracula',
      lineNumbers: true,
      lineWrapping: true,
      tabSize: 4,
      indentUnit: 4,
      extraKeys: {
        "Ctrl-S": () => {
          promptCommitMessage();
        },
        "Ctrl-F": () => {
          openSearchOverlay(this.editor);
        },
        "Ctrl-G": () => { // Added Ctrl+G shortcut for forward search
          if (lastSearchQuery) {
            performSearch(this.editor, lastSearchQuery, 'forward');
            updateSearchIndicator();
          }
        },
        "Ctrl-Shift-G": () => { // Added Ctrl+Shift-G shortcut for backward search
          if (lastSearchQuery) {
            performSearch(this.editor, lastSearchQuery, 'reverse');
            updateSearchIndicator();
          }
        }
      }
    });
    callback(this.editor);
  }

  // Method to set editor value
  setEditorValue(value, mode = 'python') {
    if (this.editor) {
      this.editor.setOption('mode', mode);
      this.editor.setValue(value);
      setTimeout(() => {
        this.editor.refresh();
      }, 10); // Adjust the timeout as needed
    }
  }

  // Method to clear the editor content
  clearEditor() {
    this.setEditorValue('');
  }
}

customElements.define('baide-editor-code', BaideEditorCode);

// Define <baide-project-tree> custom element
class BaideProjectTree extends HTMLElement {
  static get observedAttributes() {
    return ['currentproject'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style> @import "editor.css"; </style>
      <div class="baide-project-tree">
        <baide-project-selector></baide-project-selector>
        <baide-branch-selector></baide-branch-selector>
        <button id="newProjectBtn">New Project</button>
        <button id="newFileBtn">New File</button>
        <div id="projectTreeContainer"></div>
      </div>
      <style>
        /* Add necessary styles */
      </style>
    `;

    // Set default currentproject to empty string if not provided
    if (!this.hasAttribute('currentproject')) {
      this.setAttribute('currentproject', '');
    }

    // Initialize openDirectories map
    // Removed duplicate openDirectories map
  }

  get currentproject() {
    return this.getAttribute('currentproject') ?? '';
  }

  set currentproject(value) {
    this.setAttribute('currentproject', value);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'currentproject' && oldValue !== newValue) {
      // Emit project-loaded event from <baide-project-tree>
      this.dispatchEvent(new CustomEvent('project-loaded', {
        detail: { projectName: newValue },
        bubbles: true,
        composed: true
      }));
    }
  }

  connectedCallback() {
    //this.shadowRoot.getElementById('newProjectBtn').addEventListener('click', openNewProjectModal);
    //this.shadowRoot.getElementById('newFileBtn').addEventListener('click', openNewFileModal);
    this.loadProjectStructure();

    // Listen for branch-selected events from <baide-branch-selector>
    this.shadowRoot.querySelector('baide-branch-selector').addEventListener('branch-selected', (e) => {
      this.switchBranch(e.detail.branch);
    });

    // Listen for project-selected event
    this.addEventListener('project-selected', (e) => {
      this.switchProject(e.detail.projectName);
    });
  }

  async loadProjectStructure() {
    try {
      const response = await fetch(`/projects/details?project_name=${encodeURIComponent(this.currentproject)}`);
      if (response.ok) {
        const data = await response.json();
        const projectTreeContainer = this.shadowRoot.getElementById('projectTreeContainer');
        projectTreeContainer.innerHTML = ''; // Clear existing content
/*
        // Add Project Selector
        addProjectSelector(projectTreeContainer);
        
        // Add New Project Button
        const newProjectBtn = document.createElement('button');
        newProjectBtn.id = 'newProjectBtn';
        newProjectBtn.textContent = 'New Project';
        //newProjectBtn.addEventListener('click', openNewProjectModal);
        projectTreeContainer.appendChild(newProjectBtn);
        
        // Add Git Branch Display
        const gitBranchDiv = document.createElement('div');
        gitBranchDiv.id = 'gitBranchDisplay';
        gitBranchDiv.textContent = 'Loading branch...';
        gitBranchDiv.style.cursor = 'pointer';
        gitBranchDiv.addEventListener('click', () => this.openBranchPopup());
        projectTreeContainer.appendChild(gitBranchDiv);
*/            
        // Add New File Button
        const newFileBtn = document.createElement('button');
        newFileBtn.id = 'newFileBtn';
        newFileBtn.textContent = 'New File';
        //newFileBtn.addEventListener('click', openNewFileModal);
        projectTreeContainer.appendChild(newFileBtn);
      
        // Fetch the project structure separately if needed
        const structureResponse = await fetch(`/projects/structure?project_name=${encodeURIComponent(this.currentproject)}`);
        if (structureResponse.ok) {
          const structureData = await structureResponse.json();
          this.createProjectTree(structureData, projectTreeContainer);
        } else {
          showToast('Failed to load project structure.', 'error');
          console.error('Failed to load project structure.');
        }
            
        // Load open directories from localStorage before restoring
        this.loadOpenDirectories();
        // Restore open directories from localStorage
        this.restoreOpenDirectories(projectTreeContainer);
            
        // Load Git Branch
        this.loadGitBranch();

        // Adjust AI Model Dropdown based on active file
        //updateAIDropdownForActiveFile();

        // Check if there are no open files and show placeholder if necessary
        const editor = document.querySelector('baide-editor');
        if (editor && (!editor.activeFile[editor.currentProject] || Object.keys(editor.openFiles[editor.currentProject]).length === 0)) {
          editor.showPlaceholderPage();
        } else {
          editor.hidePlaceholderPage();
        }

        // Set currentproject based on response if project_name is set
        if (data.project_name) {
          this.currentproject = data.project_name;
        }
      } else {
        showToast('Failed to fetch project details.', 'error');
        console.error('Failed to fetch project details.');
      }
    } catch (e) {
      showToast('Error loading project structure.', 'error');
      console.error('Error loading project structure:', e);
    }
  }

  // Load open directories from localStorage
  loadOpenDirectories() {
    if (!this.currentproject) return;
    const storedOpenDirs = localStorage.getItem(`openDirectories_${this.currentproject}`);
    if (storedOpenDirs) {
      const dirs = new Set(JSON.parse(storedOpenDirs));
      const editor = this.closest('baide-editor');
      if (editor) {
        editor.openDirectories.set(this.currentproject, dirs);
      }
    } else {
      const editor = this.closest('baide-editor');
      if (editor) {
        editor.openDirectories.set(this.currentproject, new Set());
      }
    }
  }

  // Restore open directories in the project tree
  restoreOpenDirectories(parentElement, currentPath = '') {
    const directories = parentElement.getElementsByClassName('directory');
    Array.from(directories).forEach(dir => {
      const dirName = dir.firstChild.textContent;
      const fullPath = currentPath + dirName + '/';
      const editor = this.closest('baide-editor');
      if (editor) {
        const openDirs = editor.openDirectories.get(this.currentproject);
        if (openDirs && openDirs.has(fullPath)) {
          const childContainer = dir.querySelector('.directory-children');
          if (childContainer) {
            childContainer.classList.remove('hidden');
            dir.firstChild.classList.add('open');
            this.restoreOpenDirectories(childContainer, fullPath);
          }
        }
      }
    });
  }

  // Load Git Branch
  async loadGitBranch() {
    try {
      const response = await fetch('/git_current_branch?project_name=' + this.currentproject);
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

  // Open Branch Popup
  async openBranchPopup() {
    const popup = this.shadowRoot.getElementById('branchPopup');
    if (popup) {
      popup.classList.toggle('hidden');

      if (!popup.classList.contains('hidden')) {
        // Fetch and display branches
        try {
          const response = await fetch('/git_branches?project_name=' + this.currentproject);
          if (response.ok) {
            const data = await response.json();
            const branchList = this.shadowRoot.getElementById('branchList');
            if (branchList) {
              branchList.innerHTML = '';
              const currentBranch = this.shadowRoot.getElementById('gitBranchDisplay').textContent;
              data.branches.forEach(branch => {
                const branchItem = document.createElement('div');
                branchItem.className = 'branchItem';
                if (branch === currentBranch) {
                  branchItem.classList.add('active-branch');
                }
                branchItem.textContent = branch;
                // Emit a custom event instead of calling switchBranch directly
                branchItem.addEventListener('click', () => {
                  this.dispatchEvent(new CustomEvent('branch-selected', {
                    detail: { branch },
                    bubbles: true,
                    composed: true
                  }));
                });
                branchList.appendChild(branchItem);
              });
            }
          } else {
            console.error('Failed to load Git branches.');
          }
        } catch (e) {
          console.error('Error loading Git branches:', e);
        }
      }
    }
  }

  // Switch Branch
  async switchBranch(branchName) {
    try {
      const response = await fetch('/git_switch_branch', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ branch: branchName, project_name: this.currentproject })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          showToast(`Switched to branch ${branchName}`, 'success');
          this.loadGitBranch();
          await this.loadProjectStructure();
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
    const popup = this.shadowRoot.getElementById('branchPopup');
    if (popup) {
      popup.classList.add('hidden');
    }
  }

  // Switch Project
  async switchProject(projectName) {
    // Emit a project-loaded event with the new project name
    this.dispatchEvent(new CustomEvent('project-loaded', {
      detail: { projectName },
      bubbles: true,
      composed: true
    }));
  }

  // Member function to create the project tree
  createProjectTree(structure, parentElement, currentPath = '') {
    const directories = structure.filter(item => item.type === 'directory');
    const files = structure.filter(item => item.type === 'file');
      
    directories.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
      
    directories.forEach(dir => {
      const itemDiv = document.createElement('div');
      const dirSpan = document.createElement('span');
      dirSpan.textContent = dir.name;
      if (dir.name.startsWith('.')) {
        dirSpan.classList.add('hiddenfile');
      }
      dirSpan.addEventListener('click', () => {
        childContainer.classList.toggle('hidden');
        dirSpan.classList.toggle('open');
        const fullPath = currentPath + dir.name + '/';
        const editor = this.closest('baide-editor');
        if (editor) {
          if (childContainer.classList.contains('hidden')) {
            editor.openDirectories.get(this.currentproject).delete(fullPath);
          } else {
            editor.openDirectories.get(this.currentproject).add(fullPath);
          }
          editor.saveProjectState(this.currentproject);
          editor.adjustTabs(); // Adjust tabs when directories are toggled
        }
      });
      itemDiv.className = 'directory';
      itemDiv.appendChild(dirSpan);
      const childContainer = document.createElement('div');
      childContainer.className = 'directory-children hidden';
      // Recursively create tree with updated path
      this.createProjectTree(dir.children, childContainer, currentPath + dir.name + '/');
      itemDiv.appendChild(childContainer);
      parentElement.appendChild(itemDiv);
    });
      
    files.forEach(file => {
      const itemDiv = document.createElement('div');
      const fileSpan = document.createElement('span');
      fileSpan.textContent = file.name;
      fileSpan.className = 'file';
      if (file.name.startsWith('.')) {
        fileSpan.classList.add('hiddenfile');
      }
      const fullPath = currentPath + file.name;
      fileSpan.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('file-selected', {
          detail: {
            projectName: this.currentproject,
            filePath: fullPath
          },
          bubbles: true,
          composed: true
        }));
      });
      itemDiv.appendChild(fileSpan);
      parentElement.appendChild(itemDiv);
    });
  }
}

customElements.define('baide-project-tree', BaideProjectTree);

// Define <baide-project-selector> custom element
class BaideProjectSelector extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style> @import "editor.css"; </style>
      <select id="projectSelector">
        <option value="">Select Project</option>
      </select>
      <style>
        /* Add necessary styles */
      </style>
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
        selector.value = this.getCurrentProject();
      })
      .catch(error => {
        console.error('Error fetching project list:', error);
      });

    selector.addEventListener('change', (e) => {
      const selectedProject = e.target.value;
      if (selectedProject) {
        // Emit a custom event instead of calling switchProject directly
        this.dispatchEvent(new CustomEvent('project-selected', {
          detail: { projectName: selectedProject },
          bubbles: true,
          composed: true
        }));
      }
    });
  }

  getCurrentProject() {
    const editor = document.querySelector('baide-editor');
    return editor ? editor.currentProject : '';
  }
}

customElements.define('baide-project-selector', BaideProjectSelector);

// Define <baide-branch-selector> custom element
class BaideBranchSelector extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style> @import "editor.css"; </style>
      <div id="gitBranchDisplay">Loading branch...</div>
      <div id="branchPopup" class="hidden">
        <div class="branch-popup-content">
          <div id="branchList"></div>
          <button id="addBranchBtn">Add New Branch</button>
        </div>
      </div>
      <style>
        /* Add necessary styles */
        .hidden {
          display: none;
        }
        .branch-popup-content {
          /* Styles for popup content */
        }
        .branchItem {
          padding: 5px 10px;
          cursor: pointer;
        }
        .branchItem.active-branch {
          background-color: #4CAF50;
          color: white;
        }
      </style>
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
      const editor = document.querySelector('baide-editor');
      if (!editor.currentProject) return;

      const response = await fetch('/git_current_branch?project_name=' + editor.currentProject);
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
        const editor = document.querySelector('baide-editor');
        if (!editor.currentProject) return;

        const response = await fetch('/git_branches?project_name=' + editor.currentProject);
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
            // Emit a custom event instead of calling switchBranch directly
            branchItem.addEventListener('click', () => {
              this.dispatchEvent(new CustomEvent('branch-selected', {
                detail: { branch },
                bubbles: true,
                composed: true
              }));
            });
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
      const editor = document.querySelector('baide-editor');
      if (editor) {
        editor.showToast('Branch name cannot be empty.', 'error');
      }
      return;
    }
      
    try {
      const editor = document.querySelector('baide-editor');
      if (!editor.currentProject) return;

      const response = await fetch('/git_create_branch', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ branch: branchName, project_name: editor.currentProject })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const editor = document.querySelector('baide-editor');
          if (editor) {
            editor.showToast(`Branch ${branchName} created successfully.`, 'success');
          }
          this.loadGitBranch();
          // Refresh branch list
          this.openBranchPopup();
        } else {
          const editor = document.querySelector('baide-editor');
          if (editor) {
            editor.showToast(`Error creating branch: ${data.error}`, 'error');
          }
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

// Define <baide-chat> custom element
class BaideChat extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style> @import "editor.css"; </style>
      <div class="baide-chat">
        <baide-chat-history></baide-chat-history>
        <baide-chat-input></baide-chat-input>
      </div>
      <style>
        /* Add necessary styles */
      </style>
    `;
  }

  connectedCallback() {
    // Initialize chat functionality
    this.setupEventListeners();
  }

  // Member function stub for setupEventListeners
  setupEventListeners() {
    // TODO: Implement setupEventListeners functionality
  }
}

customElements.define('baide-chat', BaideChat);

// Define <baide-chat-history> custom element
class BaideChatHistory extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style> @import "editor.css"; </style>
      <div id="chatBox"></div>
      <div id="commitSummaries"></div>
      <div id="activeCodingContexts"></div>
      <style>
        /* Add necessary styles */
      </style>
    `;
  }

  connectedCallback() {
    this.loadTranscript();
  }

  // Member function stub for loadTranscript
  loadTranscript() {
    // TODO: Implement loadTranscript functionality
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
      <style> @import "editor.css"; </style>
      <form id="chatForm">
        <input type="text" id="promptInput" placeholder="Enter your prompt..." />
        <button type="submit">Send</button>
        <div id="throbber" style="display: none;">Loading...</div>
      </form>
      <style>
        /* Add necessary styles */
      </style>
    `;
  }

  connectedCallback() {
    const chatForm = this.shadowRoot.getElementById('chatForm');
    const promptInput = this.shadowRoot.getElementById('promptInput');
    const throbber = this.shadowRoot.getElementById('throbber');

    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const editorElement = document.querySelector('baide-editor');
      if (!editorElement.currentProject || !editorElement.activeFile[editorElement.currentProject]) return;
      const filename = editorElement.activeFile[editorElement.currentProject];
      const prompt = promptInput.value.trim();
      if (!prompt) return;
      appendMessage("User", prompt);
      scrollToBottom(this.shadowRoot.getElementById('chatBox'));
      promptInput.value = "";
      throbber.style.display = "block";

      // Store the currently active file when the request is sent
      const requestedFile = editorElement.activeFile[editorElement.currentProject];

      // Gather active context names
      const contexts = editorElement.fileCodingContexts[filename] ? editorElement.fileCodingContexts[filename].map(ctx => ctx.name) : [];

      // Get active AI model for the current file
      const activeModel = editorElement.fileActiveModels[filename] || editorElement.defaultModel;

      try {
        const response = await fetch("/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: prompt, file: filename, contexts: contexts, model: activeModel, project_name: editorElement.currentProject })
        });
        if (response.ok) {
          const data = await response.json();
          updateChatHistoryViewer(data.chat_histories);
          scrollToBottom(this.shadowRoot.getElementById('chatBox'));
          scrollToBottom(this.shadowRoot.getElementById('commitSummaries'));
          // Reload the source code after AI updates only if the active file hasn't changed
          if (editorElement.activeFile[editorElement.currentProject] === requestedFile) {
            await loadSourceCode(filename);
          }
          // Reload coding contexts
          editorElement.loadFileCodingContexts(filename);
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

// Global showToast function
function showToast(message, type = 'info') {
  let toastElement = document.querySelector('baide-toast');
  if (!toastElement) {
    toastElement = document.createElement('baide-toast');
    document.body.appendChild(toastElement);
  }
  toastElement.show(message, type);
}

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

// Function to sanitize filename for use in HTML IDs
function sanitizeId(filename) {
  return filename.replace(/[^a-zA-Z0-9-_]/g, '_');
}