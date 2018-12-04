
wdi.ClusterNodeChooser = $.spcExtend(wdi.EventObject.prototype, {
	init: function (c) {
	},

	setNodeList: function (nodeList) {
		this._nodeList = this._shuffle(nodeList);
		this._nodeListLength = this._nodeList.length;
		this._currentIndex = 0;
	},

	getAnother: function () {
		var toReturn = this._nodeList[this._currentIndex++ % this._nodeListLength];
		return toReturn;
	},

	// recipe from: http://stackoverflow.com/a/6274398
	_shuffle: function (list) {
		var counter = list.length,
			temp,
			index;
		while (counter > 0) {
			index = Math.floor(Math.random() * counter);
			counter--;
			temp = list[counter];
			list[counter] = list[index];
			list[index] = temp;
		}
		return list;
	}
});
