room.registerElement('spacezone-store', {
  storeData: {},
  currentCategory: '',
  selectedItem: null,

  create() {
    let root = this.root = document.createElement('div');
    root.className = 'spacezone-store';
    
    fetch('assets/store-items.json')
      .then(response => response.json())
      .then(data => {
        this.storeData = data;
        this.showItems();
      })
      .catch(err => console.error('Failed to load store items:', err));
  },

  showItems() {
    this.root.innerHTML = ''; // Clear existing content

    // Create Tabs
    const tabs = document.createElement('div');
    tabs.className = 'store-tabs';
    Object.keys(this.storeData).forEach((category, index) => {
      const tab = document.createElement('div');
      tab.className = 'store-tab';
      tab.textContent = category;
      if (index === 0) {
        tab.classList.add('active');
        this.currentCategory = category;
      }
      tab.addEventListener('click', () => this.switchCategory(category, tab, this.root));
      tabs.appendChild(tab);
    });
    this.root.appendChild(tabs);

    // Create Content Area
    const content = document.createElement('div');
    content.className = 'store-content';
    
    // Create Item Grid
    const grid = document.createElement('div');
    grid.className = 'item-grid';
    this.storeData[this.currentCategory].forEach(item => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'store-item';

      // Create Image Element
      const img = document.createElement('img');
      img.src = item.image ? item.image : 'assets/store/noimage.png';
      img.alt = item.name;
      img.className = 'store-item-image';
      itemDiv.appendChild(img);

      // Create Name Element
      const nameDiv = document.createElement('div');
      nameDiv.className = 'store-item-name';
      nameDiv.textContent = item.name;
      itemDiv.appendChild(nameDiv);

      itemDiv.addEventListener('click', () => this.selectItem(itemDiv, item, this.root));
      grid.appendChild(itemDiv);
    });
    content.appendChild(grid);

    // Create Item Details Area
    this.details = document.createElement('div');
    this.details.className = 'item-details';
    content.appendChild(this.details);

    this.root.appendChild(content);
    return this.root;
  },

  switchCategory(category, tabElement, root) {
    // Update active tab
    const activeTab = root.querySelector('.store-tab.active');
    if (activeTab) activeTab.classList.remove('active');
    tabElement.classList.add('active');

    this.currentCategory = category;
    this.selectedItem = null;
    this.details.innerHTML = '';

    const grid = root.querySelector('.item-grid');
    grid.innerHTML = '';
    this.storeData[category].forEach(item => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'store-item';

      // Create Image Element
      const img = document.createElement('img');
      img.src = item.image ? item.image : 'assets/store/noimage.png';
      img.alt = item.name;
      img.className = 'store-item-image';
      itemDiv.appendChild(img);

      // Create Name Element
      const nameDiv = document.createElement('div');
      nameDiv.className = 'store-item-name';
      nameDiv.textContent = item.name;
      itemDiv.appendChild(nameDiv);

      itemDiv.addEventListener('click', () => this.selectItem(itemDiv, item, this.root));
      grid.appendChild(itemDiv);
    });
  },

  selectItem(itemElement, itemData, root) {
    // Deselect previous
    const previousSelected = root.querySelector('.store-item.selected');
    if (previousSelected) previousSelected.classList.remove('selected');
    // Select new
    itemElement.classList.add('selected');
    this.selectedItem = itemData;

    // Update details
    this.details.innerHTML = '';

    // Create Image Element
    const detailImg = document.createElement('img');
    detailImg.src = itemData.image ? itemData.image : 'assets/store/noimage.png';
    detailImg.alt = itemData.name;
    detailImg.className = 'details-item-image';
    this.details.appendChild(detailImg);

    const name = document.createElement('div');
    name.className = 'details-item-name';
    name.textContent = `Name: ${itemData.name}`;
    this.details.appendChild(name);

    if (itemData.description) {
      const description = document.createElement('div');
      description.className = 'details-item-description';
      description.textContent = `Description: ${itemData.description}`;
      this.details.appendChild(description);
    }

    const price = document.createElement('div');
    price.className = 'details-item-price';
    price.textContent = `Price: $${itemData.price.toFixed(2)}`;
    this.details.appendChild(price);

    const buyButton = document.createElement('button');
    buyButton.className = 'buy-button';
    buyButton.textContent = 'Buy';
    buyButton.addEventListener('click', () => this.purchaseItem(root));
    this.details.appendChild(buyButton);
  },

  purchaseItem(root) {
    if (this.selectedItem) {
      // Implement purchase logic here
      alert(`Purchased ${this.selectedItem.name}!`);
      this.details.innerHTML = '<div>Purchase successful!</div>';
      this.selectedItem = null;
      
      const selectedElement = root.querySelector('.store-item.selected');
      if (selectedElement) selectedElement.classList.remove('selected');
    }
  }
});