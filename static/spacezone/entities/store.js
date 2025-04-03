/* 
CSS for spacezone-store

.spacezone-store {
  font-family: Arial, sans-serif;
  color: #ffffff;
}

.store-tabs {
  display: flex;
  margin-bottom: 10px;
}

.store-tab {
  padding: 10px 20px;
  cursor: pointer;
  background-color: #333;
  margin-right: 5px;
  border-radius: 4px 4px 0 0;
}

.store-tab.active {
  background-color: #555;
}

.store-content {
  background-color: #444;
  padding: 20px;
  border-radius: 0 4px 4px 4px;
}

.item-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.store-item {
  background-color: #555;
  padding: 10px;
  border-radius: 4px;
  cursor: pointer;
  flex: 1 1 calc(33% - 20px);
  box-sizing: border-box;
}

.store-item.selected {
  border: 2px solid #00ff00;
}

.item-details {
  margin-top: 20px;
  background-color: #333;
  padding: 15px;
  border-radius: 4px;
}

.buy-button {
  margin-top: 10px;
  padding: 10px 20px;
  background-color: #28a745;
  border: none;
  color: #ffffff;
  cursor: pointer;
  border-radius: 4px;
}

.buy-button:hover {
  background-color: #218838;
}
*/

room.registerElement('spacezone-store', {
  storeData: {},
  currentCategory: '',
  selectedItem: null,

  create() {
    fetch('assets/store-items.json')
      .then(response => response.json())
      .then(data => {
        this.storeData = data;
        this.showItems();
      })
      .catch(err => console.error('Failed to load store items:', err));
  },

  showItems() {
    this.clearChildren();

    // Create Tabs
    const tabs = this.createObject('object', { classname: 'store-tabs' });
    Object.keys(this.storeData).forEach((category, index) => {
      const tab = this.createObject('object', { classname: 'store-tab', text: category });
      if (index === 0) {
        tab.classList.add('active');
        this.currentCategory = category;
      }
      tab.addEventListener('click', () => this.switchCategory(category, tab));
      tabs.appendChild(tab);
    });

    // Create Content Area
    const content = this.createObject('object', { classname: 'store-content' });
    
    // Create Item Grid
    const grid = this.createObject('object', { classname: 'item-grid' });
    this.storeData[this.currentCategory].forEach(item => {
      const itemObj = this.createObject('object', { classname: 'store-item', text: item.name });
      itemObj.addEventListener('click', () => this.selectItem(itemObj, item));
      grid.appendChild(itemObj);
    });
    content.appendChild(grid);

    // Create Item Details Area
    this.details = this.createObject('object', { classname: 'item-details' });
    content.appendChild(this.details);

    this.appendChild(tabs);
    this.appendChild(content);
  },

  switchCategory(category, tabElement) {
    // Update active tab
    this.querySelector('.store-tab.active')?.classList.remove('active');
    tabElement.classList.add('active');

    this.currentCategory = category;
    this.selectedItem = null;
    this.details.clearChildren();

    const grid = this.querySelector('.item-grid');
    grid.clearChildren();
    this.storeData[category].forEach(item => {
      const itemObj = this.createObject('object', { classname: 'store-item', text: item.name });
      itemObj.addEventListener('click', () => this.selectItem(itemObj, item));
      grid.appendChild(itemObj);
    });
  },

  selectItem(itemElement, itemData) {
    // Deselect previous
    this.querySelector('.store-item.selected')?.classList.remove('selected');
    // Select new
    itemElement.classList.add('selected');
    this.selectedItem = itemData;

    // Update details
    this.details.clearChildren();
    this.details.createObject('object', { text: `Name: ${itemData.name}` });
    this.details.createObject('object', { text: `Price: $${itemData.price.toFixed(2)}` });
    if (itemData.description) {
      this.details.createObject('object', { text: `Description: ${itemData.description}` });
    }
    const buyButton = this.details.createObject('object', { classname: 'buy-button', text: 'Buy' });
    buyButton.addEventListener('click', () => this.purchaseItem());
  },

  purchaseItem() {
    if (this.selectedItem) {
      this.dispatchEvent('purchased', { item: this.selectedItem });
      // Optionally, provide feedback to user
      this.details.createObject('object', { text: 'Purchase successful!' });
      this.selectedItem = null;
      this.querySelector('.store-item.selected')?.classList.remove('selected');
    }
  }
});