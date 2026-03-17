import * as THREE from 'three';

export class DataManager {
	socketParams = $state({
		url: 'ws://localhost:9100',
		status: 'Disconnected'
	});
	sceneConfig = $state({
		cameraMode: 'Follow',
		cameraTrack: 'Body',
		stlOpacity: 0.8,
		stlColor: '#ffffff',
		buoyColor: '#f34242',
		buoyScale: 1,
		buoyFlashRate: 0.5,
		buoyTrailCount: 10,
		maxBuoyTrailCount: 20,
		nearBuoyPos: {x: 10, y: -10},
		farBuoyPos: {x: 10, y: -815},
		waterplaneColor: '#75b8ff',
		waterplaneOpacity: 0.3,
	});
	usvStates = $state({
		U: {u: 0, v: 0, w: 0},
		omega: {p: 0, q: 0, r: 0},
		Phi: {phi: 0, theta: 0, psi: 0},
		deltaPsi: 0,
		r: {x: 0, y: 0, z: 0},
		I: 0,
		RPM: 0,
		V: 0,
		psi_ra: 0,
		time: 0,
	});
	controlStates = $state({
		input: {x: 0, y: 0},
		main: false,
		aux: false,
		cooling: 0,
		bilge: 0
	});
	callbacks = {}
	constructor() {
		this.#setMappingParameters();
	}
	#telemFunc(k,v) {
		if (Object.prototype.toString.call(v) === '[object Array]') {
			if (k.startsWith('C')) {
				v = v.map(val => parseFloat(val).toFixed(4));
				let lst = [
					v.slice(0,3),
					v.slice(3,6),
					v.slice(6,9),
				]
				return lst
			}
			else if (v.every(e => typeof e === 'number'))
				return '<'+v.map(val => parseFloat(val).toFixed(4)).join(', ')+'>'
			else return '['+v.join(', ')+']'
		} else if (Object.prototype.toString.call(v) === '[object Number]') {
			return parseFloat(v).toFixed(4);
		}
		return v
	}
	updateSocketStatus(status) {
		this.socketParams.status = status;
	}
	updateSimulationStatus(running) {
		if (this.usvStates.running && !running) {
			this.syncControlStates();
			this.syncInputs();
		}
		this.usvStates.running = running
		this.usvStates.cmdQueued = false;
	}
	setTelem(msg) {
		this.telem.raw = msg;
		this.telem.json = JSON.stringify(msg, this.#telemFunc, 2);
		const { surf, ...hullProperties } = msg['hull']
		this.telem.hull = JSON.stringify(hullProperties, this.#telemFunc, 2);
		this.telem.surf = JSON.stringify(surf, this.#telemFunc, 2);
		const sepPanels = Object.entries(msg['panels']).reduce((acc, [id,value]) => {
			const targetGroup = id.startsWith('r')? 'rear' : 'main';
			acc[targetGroup][id] = value;
			return acc;
		}, { main: {}, rear: {} });
		this.telem.wings.main = JSON.stringify(sepPanels.main, this.#telemFunc, 2);
		this.telem.wings.rear = JSON.stringify(sepPanels.rear, this.#telemFunc, 2);
		this.telem.wings.root = JSON.stringify(msg['wing_roots'], this.#telemFunc, 2);
		this.telem.propulsor = JSON.stringify(msg['propulsor'], this.#telemFunc, 2);
		const { hull, panels, wing_roots, propulsor, type, ...otherProperties } = msg;
		this.telem.misc = JSON.stringify(otherProperties, this.#telemFunc, 2);

		this.usvStates.U.u = msg['U'][0];
		this.usvStates.U.v = msg['U'][1];
		this.usvStates.U.w = msg['U'][2];
		this.usvStates.omega.p = msg['omega'][0]*180/Math.PI;
		this.usvStates.omega.q = msg['omega'][1]*180/Math.PI;
		this.usvStates.omega.r = msg['omega'][2]*180/Math.PI;
		this.usvStates.Phi.phi = msg['Phi'][0]*180/Math.PI;
		this.usvStates.Phi.theta = msg['Phi'][1]*180/Math.PI;
		const oldPsi = this.usvStates.Phi.psi;
		this.usvStates.Phi.psi = msg['Phi'][2]*180/Math.PI;
		this.usvStates.Phi.psi -= this.usvStates.Phi.psi>180? 360 : 0;
		this.usvStates.deltaPsi = this.usvStates.Phi.psi-oldPsi;
		this.states.r.fromArray(msg['r']);
		this.usvStates.r.x = msg['r'][0];
		this.usvStates.r.y = msg['r'][1];
		this.usvStates.r.z = msg['r'][2]*100;
		this.usvStates.psi_ra = msg['psi_ra']*180/Math.PI;
		this.usvStates.rate = msg['rate'];
		this.usvStates.time = msg['time'];
		this.states.C0b.fromArray(msg['C0b']).transpose();
		this.states.Cra_b.fromArray(msg['Cra_b']).transpose();
		this.states.Cb_ra = this.states.Cra_b.clone().transpose();
	}
	#setMappingParameters() {
		this.constants.V_params.coeffs = this.#getMappingParameters(this.constants.V_params.x0,this.constants.V_params.y0);
		this.constants.psi_ra_params.coeffs = this.#getMappingParameters(this.constants.psi_ra_params.x0,this.constants.psi_ra_params.y0);
	}
	#getMappingParameters(x0,y0) {
		// Piecewise Linear Cubic
		const A = (y0-x0)/(x0*(x0-1)**3);
		const B = 3*(x0-y0)/(x0-1)**3;
		const C = ((y0-3)*x0**3-y0+3*x0*y0)/(x0*(x0-1)**3);
		const D = ((x0-y0)*x0**2)/(x0-1)**3;
		return [A,B,C,D];
	}
	queryMapped(x,params) {
		const xi = Math.abs(x);
		let y = 0;
		if (xi < params.x0) y = params.y0/params.x0*xi;
		else y = params.coeffs[0]*xi**3 + params.coeffs[1]*xi**2 + params.coeffs[2]*xi + params.coeffs[3];
		return Math.sign(x)*y;
	}
	setMethod(method) {
		this.usvStates.method = method;
	}
	setBuildTelem(msg) {
		this.telem.build = JSON.stringify(msg, this.#telemFunc, 2);
		
		this.constants.r_CM.fromArray(msg['r_CM']);
		this.constants.r_ra.fromArray(msg['r_ra']);
		this.constants.V_max = msg['V_max'];
		this.constants.psi_ra_max = msg['psi_ra_max']*180/Math.PI;
		this.constants.V_tau = msg['V_tau'];
		this.constants.psi_ra_rate = msg['psi_ra_rate']*180/Math.PI;

		this.constants.V_params.x0 = msg['V_x0'];
		this.constants.V_params.y0 = msg['V_y0'];
		this.constants.psi_ra_params.x0 = msg['psi_ra_x0'];
		this.constants.psi_ra_params.y0 = msg['psi_ra_y0'];
		this.#setMappingParameters();
		
		this.methods = msg['methods'];
	}
	syncControlStates() {
		this.controlStates.U.x = this.usvStates.U.u;
		this.controlStates.U.y = this.usvStates.U.v;
		this.controlStates.U.z = this.usvStates.U.w;
		
		this.controlStates.omega.x = this.usvStates.omega.p;
		this.controlStates.omega.y = this.usvStates.omega.q;
		this.controlStates.omega.z = this.usvStates.omega.r;
		
		this.controlStates.Phi.x = this.usvStates.Phi.phi;
		this.controlStates.Phi.y = this.usvStates.Phi.theta;
		this.controlStates.Phi.z = this.usvStates.Phi.psi;
		
		this.controlStates.r.x = this.usvStates.r.x;
		this.controlStates.r.y = this.usvStates.r.y;
		this.controlStates.r.z = this.usvStates.r.z;
	}
	syncInputs() {
		this.controlStates.input.x = -this.usvStates.psi_ra / this.constants.psi_ra_max;
		this.controlStates.input.y = this.usvStates.V / this.constants.V_max;
	}
}