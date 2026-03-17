import * as THREE from 'three';

export class Waterplane extends THREE.Group {
	constructor(config, size, divisions, iterations) {
		super();
		this.config = config;
		this.size = size;
		this.iterations = iterations;

		this.tileGoem = new THREE.PlaneGeometry(size, size);
		this.grids = []
		this.tiles = []
		for (let i=0; i<(2*iterations+1)**2; i++) {
			const grid = new THREE.GridHelper(size,divisions);
			grid.rotation.x = Math.PI/2;
			grid.material.transparent = true;
			this.grids.push(grid);
			
			const tileMat = new THREE.MeshBasicMaterial({ transparent: true, color: config.waterplaneColor, 
				opacity: i == 0? config.waterplaneOpacity : 0, side: THREE.DoubleSide, depthWrite: false });
			const tile = new THREE.Mesh(this.tileGoem, tileMat);
			tile.baseOpacity = 1;
			this.tiles.push(tile);
			this.add(grid, tile);
		}
	}
	toggleWaterplane() {
		this.tiles.forEach(t => t.visible = !t.visible);
	}
	toggleGrid() {
		this.grids.forEach(g => g.visible = !g.visible);
	}
	syncVisuals() {
		this.tiles.forEach(t => {
			t.material.color.set(this.config.waterplaneColor);
			t.material.opacity = t.baseOpacity*this.config.waterplaneOpacity;
		})
	}
	updateGrid(pos) {
		const px = Math.round(pos.x / this.size);
		const py = Math.round(pos.y / this.size);

		let idx = 0;
		for (let x = -this.iterations; x <= this.iterations; x++) {
			for (let y = -this.iterations; y <= this.iterations; y++) {
				const tile = this.tiles[idx]
				const grid = this.grids[idx]
				tile.position.set((px + x)*this.size, (py + y)*this.size, 0)
				grid.position.copy(tile.position)
				let factor = 1;
				let fDist = tile.position.distanceTo(pos)/(this.size*this.iterations*0.75*Math.sqrt(2));
				if (fDist < 0.75) factor = 1;
				else if (fDist < 1.25) factor = 1-(fDist-0.75)/0.5;
				else factor = 0;
				tile.baseOpacity = factor;
				grid.material.opacity = tile.baseOpacity;
				idx++;
			}
		}
	}
}