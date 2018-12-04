

wdi.CollisionDetector = {
	thereIsBoxCollision: function(baseBox, queueBox) {
		if(baseBox.bottom < queueBox.top) return false;
		if(baseBox.top > queueBox.bottom) return false;
		if(baseBox.right < queueBox.left) return false;
		return baseBox.left < queueBox.right;
	}
};
