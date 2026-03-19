<script lang='ts'>
	import { Pane, Folder, Binding, Monitor, Button, Slider, Color, Point,
		List, ButtonGrid, type ButtonGridClickEvent, RadioGrid} from 'svelte-tweakpane-ui'
	import { DataManager } from './data_manager.svelte.js';

	let { dm }: { dm: DataManager } = $props();

	let isDisconnected = $derived(dm.socketParams.status == 'Disconnected');
	let isConnected = $derived(dm.socketParams.status == 'Connected');
	let connectBtnTitle = $derived(isConnected? 'Connected' : 'Connect');
</script>

<Pane title='Controls' x={0} y={0} width={300} localStoreId='leftPane'>
	<Folder title='Websocket'>
		<Binding bind:object={dm.socketParams} key='url' label='address' />
		<Monitor value={dm.socketParams.status} label='status' />
		<Button on:click={() => dm.callbacks.onConnect(dm.socketParams.url)} 
			title={connectBtnTitle}
			disabled={!isDisconnected} />
	</Folder>
	<Folder title='Commands' disabled={!isConnected} >
		<Button on:click={() => dm.callbacks.onEstop()} title='Emergency Stop' />
		<Folder title='Auxiliary'>
			<Button title='Enable' disabled={dm.telem.auxEnable} on:click={() => dm.callbacks.onStateChange('aux',true)} />
			<Button title='Disable' disabled={!dm.telem.auxEnable} on:click={() => dm.callbacks.onStateChange('aux',false)} />
		</Folder>
		<Folder title='Main'>
			<Button title='Enable' disabled={dm.telem.mainEnable} on:click={() => dm.callbacks.onStateChange('main',true)} />
			<Button title='Disable' disabled={!dm.telem.mainEnable} on:click={() => dm.callbacks.onStateChange('main',false)} />
			<Monitor label='Energized' value={dm.telem.mainEcho} disabled={!dm.telem.usvLinkActive} />
		</Folder>
		<Folder title='Flags'>
			<Monitor label='USV Link' value={dm.telem.usvLinkActive} />
			<Monitor label='rssi [dBm]' value={dm.telem.rssi} disabled={!dm.telem.usvLinkActive} format={v => v.toFixed(0)} />
			<Monitor label='GS Link' value={dm.telem.gsLinkActive} disabled={!dm.telem.usvLinkActive} />
			<Monitor label='ESC Link' value={dm.telem.escLinkActive} disabled={!dm.telem.usvLinkActive}  />
			<Monitor label='Contactor Ctrl' value={dm.telem.controlledContactor} disabled={!dm.telem.usvLinkActive} />
			<Button on:click={() => dm.callbacks.onReset()} title='Reset' disabled={!dm.telem.usvLinkActive} />
		</Folder>
		<Folder title='Pumps'>
			<Slider bind:value={dm.cmds.cooling} label='Cooling' min={0} max={1} format={v => v.toFixed(2)} on:change={ev => {
				if (ev.detail.origin == 'internal') dm.callbacks.onStateChange('cooling',Math.trunc(ev.detail.value*255))
			}} />
			<Slider bind:value={dm.cmds.bilge} label='Bilge' min={0} max={1} format={v => v.toFixed(2)} on:change={ev => {
				if (ev.detail.origin == 'internal') dm.callbacks.onStateChange('bilge',Math.trunc(ev.detail.value*255))
			}}/>
		</Folder>
		<Folder title='Drive'>
			<Button on:click={() => {
				dm.callbacks.onNull();
				dm.cmds.input.x = 0;
				dm.cmds.input.y = 0;
			}} title='Null Controls' />
			<Point bind:value={dm.cmds.input} label='<%s,%t>' 
				optionsX={{min: -1, max: 1}}
				optionsY={{min: -1, max: 1, inverted: true}}
				picker='inline'
				expanded={true}
				on:change={ev => dm.callbacks.onInput(ev.detail)}
				format={v => v.toFixed(2)}/>
		</Folder>
	</Folder>
</Pane>

<Pane title='Telemetry' x={window.innerWidth} y={0} width={300} localStoreId='rightPane' >
	<Folder title='drive'>
		<Monitor label='steering [%]' value={dm.telem.steering*100} format={v => v.toFixed(0)} />
		<Monitor label='throttle [%]' value={dm.telem.throttle*100} format={v => v.toFixed(0)} />
	</Folder>
	<Folder title='ESC'>
		<Monitor label='motor current [A]' value={dm.telem.ESC.motorCurrent} format={v => v.toFixed(2)} />
		<Monitor label='input current [A]' value={dm.telem.ESC.inputCurrent} format={v => v.toFixed(2)} />
		<Monitor label='duty cycle [%]' value={dm.telem.ESC.dutyCycleNow*100} format={v => v.toFixed(0)} />
		<Monitor label='RPM' value={dm.telem.ESC.eRPM / 5} format={v => v.toFixed(0)} />
		<Monitor label='input voltage [V]' value={dm.telem.ESC.inputVoltage} format={v => v.toFixed(2)} />
		<Monitor label='consumed [Wh]' value={dm.telem.ESC.wattHours} format={v => v.toFixed(2)} />
		<Monitor label='charged [Wh]' value={dm.telem.ESC.wattHoursCharged} format={v => v.toFixed(2)} />
		<Monitor label='mosfet temp [°C]' value={dm.telem.ESC.tempMofset} format={v => v.toFixed(1)} />
		<Monitor label='motor temp [°C]' value={dm.telem.ESC.tempMotor} format={v => v.toFixed(1)} />
	</Folder>
</Pane>