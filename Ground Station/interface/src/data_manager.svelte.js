
export class DataManager {
	socketParams = $state({
		url: 'ws://localhost:9100',
		status: 'Disconnected'
	});
	cmds = $state({
		input: {x: 0, y: 0},
		cooling: 0,
		bilge: 0,
		main: false,
		aux: false,
	});
	telem = $state({
		ESC: {
			motorCurrent: 0,
			inputCurrent: 0,
			dutyCycleNow: 0,
			eRPM: 0,
			inputVoltage: 0,
			wattHours: 0,
			wattHoursCharged: 0,
			tempMofset: 0,
			tempMotor: 0,
		},
		throttle: 0,
		steering: 0,
		mainEnable: false,
		auxEnable: false,
		mainEcho: false,
		gsLinkActive: false,
		escLinkActive: false,
		controlledContactor: false,
		time: 0,

		usvLinkActive: false,
		rssi: 0,
	});
	callbacks = {};
	throttle_params = {
		x0: 0.4,
		y0: 0.3,
	};
	steering_params = {
		x0: 0.25,
		y0: 0.1
	};
	log = []
	constructor() {
		this.throttle_params.coeffs = this.#getMappingParameters(this.throttle_params.x0, this.throttle_params.y0);
		this.steering_params.coeffs = this.#getMappingParameters(this.steering_params.x0, this.steering_params.y0);
	}
	updateSocketStatus(status) {
		this.socketParams.status = status;
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
	syncCmds(data) {
		this.cmds.input.y = data['throttle'];
		this.cmds.input.x = data['steering'];
		this.cmds.cooling = data['cooling']/255;
		this.cmds.bilge = data['bilge']/255;
		this.cmds.main = data['main'];
		this.cmds.aux = data['aux'];
	}
	syncTelem(data) {
		this.telem.ESC.motorCurrent = data['ESC']['motorCurrent'];
		this.telem.ESC.inputCurrent = data['ESC']['inputCurrent'];
		this.telem.ESC.dutyCycleNow = data['ESC']['dutyCycleNow'];
		this.telem.ESC.eRPM = data['ESC']['eRPM'];
		this.telem.ESC.inputVoltage = data['ESC']['inputVoltage'];
		this.telem.ESC.wattHours = data['ESC']['wattHours'];
		this.telem.ESC.wattHoursCharged = data['ESC']['wattHoursCharged'];
		this.telem.ESC.tempMofset = data['ESC']['tempMosfet'];
		this.telem.ESC.tempMotor = data['ESC']['tempMotor'];

		this.telem.throttle = data['throttle'];
		this.telem.steering = data['steering'];
		this.telem.mainEnable = data['mainEnable'];
		this.telem.auxEnable = data['auxEnable'];
		this.telem.mainEcho = data['mainEcho'];
		this.telem.gsLinkActive = data['gsLinkActive'];
		this.telem.escLinkActive = data['escLinkActive'];
		this.telem.controlledContactor = data['controlledContactor'];
		this.telem.time = data['time'];

		this.telem.usvLinkActive = data['usvLinkActive'];
		this.telem.rssi = data['rssi'];

		const entry = {
			// ESC Specific Data
			motorCurrent: this.telem.ESC.motorCurrent,
			inputCurrent: this.telem.ESC.inputCurrent,
			dutyCycleNow: this.telem.ESC.dutyCycleNow,
			RPM: this.telem.ESC.eRPM / 5,
			inputVoltage: this.telem.ESC.inputVoltage,
			wattHours: this.telem.ESC.wattHours,
			wattHoursCharged: this.telem.ESC.wattHoursCharged,
			tempMofset: this.telem.ESC.tempMofset,
			tempMotor: this.telem.ESC.tempMotor,

			// General Control & Status
			throttle: this.telem.throttle,
			steering: this.telem.steering,
			mainEnable: this.telem.mainEnable,
			auxEnable: this.telem.auxEnable,
			mainEcho: this.telem.mainEcho,
			gsLinkActive: this.telem.gsLinkActive,
			escLinkActive: this.telem.escLinkActive,
			controlledContactor: this.telem.controlledContactor,
			time: this.telem.time,
			gsTime: Date.now(),

			// Communication Links
			usvLinkActive: this.telem.usvLinkActive,
			rssi: this.telem.rssi
		};
		this.log.push(entry);
	}
	resetRefValues;
	lastRssi;
	telemDelta;
	telemDelay;
	onUpdate(now) {

		//TODO: update loop, avg rssi, transmit interval
	}
}