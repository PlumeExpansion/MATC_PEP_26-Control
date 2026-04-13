import asyncio
import websockets
import json
import time
from digi.xbee.devices import XBeeDevice, RemoteXBeeDevice
from digi.xbee.models.address import XBee64BitAddress
from digi.xbee.packets.common import ATCommPacket, ATCommResponsePacket
from digi.xbee.exception import XBeeException
import serial.tools.list_ports as list_ports

import os
os.environ['PYGAME_HIDE_SUPPORT_PROMPT'] = '1'
os.environ['PYTHONWARNINGS'] = 'ignore'
import pygame

import USV_states as USVS

# --- USV State Handlers ---
async def null_controls():
	USVS.cmds['throttle'] = 0
	USVS.cmds['steering'] = 0
	print(f'INFO: nulling controls')

async def estop():
	USVS.cmds['throttle'] = 0
	USVS.cmds['steering'] = 0
	USVS.cmds['cooling'] = 0
	USVS.cmds['bilge'] = 0
	USVS.cmds['aux'] = False
	USVS.cmds['main'] = False
	device.send_data_async(remote_device, USVS.pack_aux())
	device.send_data_async(remote_device, USVS.pack_main())
	device.send_data_async(remote_device, USVS.pack_bilge())
	device.send_data_async(remote_device, USVS.pack_cooling())
	for socket in sockets: await sync_cmds(socket)
	print(f'INFO: emergency stop, cutting all power')

async def reset_flags():
	device.send_data_async(remote_device, USVS.pack_reset())
	print(f'INFO: resetting flags')

async def sync_cmds(socket):
	await socket.send(json.dumps({'type': 'cmds', 'data': USVS.cmds}))

async def sync_telem(socket):
	await socket.send(json.dumps({'type': 'telem', 'data': USVS.telem}))

async def send_aux():
	for socket in sockets: await sync_cmds(socket)
	device.send_data_async(remote_device, USVS.pack_aux())

async def send_main():
	for socket in sockets: await sync_cmds(socket)
	device.send_data_async(remote_device, USVS.pack_main())

# --- Xbee Link ---
BAUD = 115200
MAC_USV_RN = "0013A20042839427"

sockets = set()

ports = list_ports.comports()
com_list = [p.device for p in ports]
print(f"Select XBee COM port: {com_list}")
PORT = input()

if PORT.strip() == '':
	PORT = com_list[0]
	print(f'Attempting {PORT}')

try:
	device = XBeeDevice(PORT, BAUD)
	device.open()
	# device.serial_port.rtscts = True # type: ignore # Enable Flow Control for the Waveshare board
except Exception as e:
	print(f'ERROR: XBee initialization failed - {e}')
	exit()

remote_addr = XBee64BitAddress.from_hex_string(MAC_USV_RN)
remote_device = RemoteXBeeDevice(device, remote_addr)

last_received = 0
def on_data_received(xbee_message):
	global last_received
	# sender = xbee_message.remote_device.get_64bit_addr()
	# if (sender != MAC_USV_RN):
	# 	print(f'WARNING: received from unknown address - {sender}')
	# 	return
	last_received = time.perf_counter()
	USVS.unpack_telem(xbee_message.data)

def packet_received_callback(packet):
	if isinstance(packet, ATCommResponsePacket):
		if packet.command == "DB":
			USVS.telem['rssi'] = -packet.command_value[0] # type: ignore

device.add_data_received_callback(on_data_received)
device.add_packet_received_callback(packet_received_callback)

# --- Joystick Link ---
pygame.init()
pygame.joystick.init()
controller = None

if pygame.joystick.get_count() == 0:
	print("WARNING: no controller detected")
else:
	try:
		controller = pygame.joystick.Joystick(0)
		controller.init()
		if not controller.get_init():
			print(f'ERROR: controller initialization failed')
		else:
			print(f'INFO: controller linked - "{controller.get_name()}"')
	except Exception as e:
		print(f'ERROR: controller link failed - {e}')

# --- Network Handlers ---
transmit_cooling = False
transmit_bilge = False
async def handler(socket: websockets.ServerConnection):
	global transmit_bilge, transmit_cooling
	sockets.add(socket)
	print(f'INFO: connected to {socket.remote_address}')
	await sync_cmds(socket)
	await sync_telem(socket)
	try:
		async for message in socket:
			data = json.loads(message)
			try:
				dataType = data['type']
				if dataType == 'set':
					state, value = data['state'], data['value']
					if state == 'main':
						USVS.cmds['main'] = value
						device.send_data_async(remote_device, USVS.pack_main())
					elif state == 'aux':
						USVS.cmds['aux'] = value
						device.send_data_async(remote_device, USVS.pack_aux())
					elif state == 'cooling':
						USVS.cmds['cooling'] = value
						transmit_cooling = True
					elif state == 'bilge':
						USVS.cmds['bilge'] = value
						transmit_bilge = True
					elif state == 'input':
						if (controller is None):
							USVS.cmds['throttle'] = value['y']
							USVS.cmds['steering'] = value['x']
					else: print(f'WARNING: unknown state set request - {state} = {value}')
				elif dataType == 'null':
					await null_controls()
				elif dataType == 'reset':
					await reset_flags()
				elif dataType == 'estop':
					await estop()
				else:
					print(f'WARNING: unknown data received - {data}')
			except Exception as e:
				print(f'ERROR: corrupt data received "{data}" - {e}')
	except websockets.ConnectionClosed:
		pass
	finally:
		sockets.remove(socket)
		print(f'INFO: lost connection to {socket.remote_address}')
		if not sockets: print(f'WARNING: no remaining sockets')

# --- Background Loops ---
async def transmit_loop(transmit_task, stop_event):
	global transmit_cooling, transmit_bilge

	loop_rate = 100
	drive_rate = 20
	pump_rate = 1
	rssi_rate = 10

	last_drive = 0
	last_rssi = 0
	last_pump = 0
	try:
		while True:
			# broadcast commands
			now = time.perf_counter()
			USVS.telem['usvLinkActive'] = now - last_received < 1
			if now - last_drive > 1/drive_rate:
				last_drive = now
				device.send_data_async(remote_device, USVS.pack_drive())

				if now - last_pump > 1/pump_rate:
					last_pump = now
					transmit_cooling = False
					transmit_bilge = False
					device.send_data_async(remote_device, USVS.pack_cooling())
					device.send_data_async(remote_device, USVS.pack_bilge())
				else:
					if transmit_cooling:
						transmit_cooling = False
						device.send_data_async(remote_device, USVS.pack_cooling())
					if transmit_bilge:
						transmit_bilge = False
						device.send_data_async(remote_device, USVS.pack_bilge())
			
			if now - last_rssi > 1/rssi_rate:
				last_rssi = now
				at_db_packet = ATCommPacket(frame_id=1, command='DB')
				device.send_packet(at_db_packet)
				
			# sync telem
			for socket in sockets: await sync_telem(socket)

			await asyncio.sleep(1/loop_rate)
	except asyncio.CancelledError:
		print('INFO: transmit loop terminated')
	except XBeeException as e:
		print(f'ERROR: XBee error - {e}')
		print(f'INFO: terminating')
		stop_event.set()

	except Exception as e:
		print(f'ERROR: transmit error - {e}')
		print(f'INFO: restarting transmit task')
		transmit_task = asyncio.create_task(transmit_loop(transmit_task, stop_event))

async def console_loop():
	sentinel = ['q', 'quit', 'stop', 'exit']
	steering_sentinel = ['s', 'str', 'steer', 'steering']
	throttle_sentinel = ['t', 'ttl', 'throttle']
	estop_sentinel = ['es', 'estop', 'emergency']
	enable_sentinel = ['on', 'true', 'enable']
	while True:
		cmd = await asyncio.to_thread(input)
		cmd = cmd.lower()
		tokens = cmd.split(' ')
		if cmd in sentinel:
			print('INFO: termination received')
			break
		# console commands
		if cmd == 'null' or cmd == 'n':
			await null_controls()
		if cmd == 'reset' or cmd == 'r':
			await reset_flags()
		elif cmd == 'time':
			print(f'INFO: {'' if USVS.telem['usvLinkActive'] else 'last received '}USV time at {USVS.telem['time']/1000:.3f} second(s)')
		elif cmd == 'status':
			if USVS.telem['usvLinkActive']:
				print(f'INFO: USV link active at signal strength {USVS.telem['rssi']} dBm')
			else:
				print(f'INFO: USV link inactive, last received {int(time.perf_counter() - last_received)} second(s) ago')
		elif cmd in throttle_sentinel:
			print(f'INFO: throttle - current: {int(100*USVS.telem['throttle'])}%\ttarget: {int(100*USVS.cmds['throttle'])}%')
		elif cmd in steering_sentinel:
			print(f'INFO: steering - current: {int(100*USVS.telem['steering'])}%\ttarget: {int(100*USVS.cmds['steering'])}%')
		elif cmd == 'cooling':
			print(f'INFO: cooling at {int(100*USVS.cmds['cooling']/255)}%')
		elif cmd == 'bilge':
			print(f'INFO: bilge at {int(100*USVS.cmds['bilge']/255)}%')
		elif cmd == 'aux':
			print(f'INFO: auxiliary power - current: {'enabled' if USVS.telem['auxEnable'] else 'disabled'}\ttarget: {'enabled' if USVS.cmds['aux'] else 'disabled'}')
		elif cmd == 'main':
			print(f'INFO: main power - current: {'enabled' if USVS.telem['mainEnable'] else 'disabled'}\ttarget: {'enabled' if USVS.cmds['main'] else 'disabled'}')
		elif cmd in estop_sentinel:
			await estop()
		elif len(tokens) == 2:
			cmd = tokens[0]
			arg = tokens[1]
			if cmd in throttle_sentinel:
				if controller:
					print(f'WARNING: controller connected, set throttle with controller')
					continue
				try:
					percent = float(arg)
					if -100 <= percent <= 100:
						USVS.cmds['throttle'] = percent/100
						print(f'INFO: throttle set to {int(percent)}%')
					else:
						print(f'ERROR: invalid throttle percent - {arg}')
				except:
					print(f'ERROR: nonfloat throttle percent - {arg}')
			elif cmd in steering_sentinel:
				if controller:
					print(f'WARNING: controller connected, set steering with controller')
					continue
				try:
					percent = float(arg)
					if -100 <= percent <= 100:
						USVS.cmds['steering'] = percent/100
						print(f'INFO: steering set to {int(percent)}%')
					else:
						print(f'ERROR: invalid steering percent - {arg}')
				except:
					print(f'ERROR: nonfloat steering percent - {arg}')
			elif cmd == 'cooling':
				if controller:
					print(f'WARNING: controller connected, set cooling with controller')
					continue
				try:
					percent = float(arg)
					if 0 <= percent <= 100:
						USVS.cmds['cooling'] = int(percent/100)
						device.send_data_async(remote_device, USVS.pack_cooling())
						for socket in sockets: await sync_cmds(socket)
						print(f'INFO: cooling set to {int(percent)}%')
					else:
						print(f'ERROR: invalid cooling percent - {arg}')
				except:
					print(f'ERROR: nonfloat cooling percent - {arg}')
			elif cmd == 'bilge':
				if controller:
					print(f'WARNING: controller connected, set bilge with controller')
					continue
				try:
					percent = float(arg)
					if 0 <= percent <= 100:
						USVS.cmds['bilge'] = int(255*percent/100)
						device.send_data_async(remote_device, USVS.pack_bilge())
						for socket in sockets: await sync_cmds(socket)
						print(f'INFO: bilge set to {int(percent)}%')
					else:
						print(f'ERROR: invalid bilge percent - {arg}')
				except:
					print(f'ERROR: nonfloat bilge percent - {arg}')
			elif cmd == 'aux':
				if arg in enable_sentinel:
					USVS.cmds['aux'] = True
					print(f'INFO: auxiliary power enabled')
				else:
					USVS.cmds['aux'] = False
					print(f'INFO: auxiliary power disabled')
				for socket in sockets: await sync_cmds(socket)
				device.send_data_async(remote_device, USVS.pack_aux())
			elif cmd == 'main':
				if arg in enable_sentinel:
					USVS.cmds['main'] = True
					print(f'INFO: main power enabled')
				else:
					USVS.cmds['main'] = False
					print(f'INFO: main power disabled')
				for socket in sockets: await sync_cmds(socket)
				device.send_data_async(remote_device, USVS.pack_main())
			else:
				print(f'WARNING: unknown augmented command received - {cmd} - {arg}')
		else:
			print(f'WARNING: unknown command received - {cmd}')

async def controller_loop():
	global transmit_bilge, transmit_cooling
	last_aux_enable = False
	last_aux_disable = False
	last_main_enable = False
	last_main_disable = False
	last_e_stop = False
	last_reset  = False
	if controller is None: return
	loop_rate = 100
	try:
		while True:
			pygame.event.pump()

			yaw = controller.get_axis(5)
			throttle = (1-controller.get_axis(2))/2

			cooling = int(255*(1+controller.get_axis(6))/2)
			bilge = int(255*(1+controller.get_axis(3))/2)
			if cooling != USVS.cmds['cooling']:
				USVS.cmds['cooling'] = cooling
				transmit_cooling = True
			if bilge != USVS.cmds['bilge']:
				USVS.cmds['bilge'] = bilge
				transmit_bilge = True
			
			e_stop = controller.get_button(1)
			reset = controller.get_button(6)
			if e_stop and not last_e_stop: await estop()
			if reset and not last_reset: await reset_flags()
			last_e_stop = e_stop
			last_reset = reset

			aux_enable = controller.get_button(8)
			aux_disable = controller.get_button(9)
			if aux_enable and not last_aux_enable:
				USVS.cmds['aux'] = True
				await send_aux()
			if aux_disable and not last_aux_disable:
				USVS.cmds['aux'] = False
				await send_aux()
			last_aux_enable = aux_enable
			last_aux_disable = aux_disable
			
			main_enable = controller.get_button(10)
			main_disable = controller.get_button(11)
			if main_enable and not last_main_enable:
				USVS.cmds['main'] = True
				await send_main()
			if main_disable and not last_main_disable:
				USVS.cmds['main'] = False
				await send_main()
			last_main_enable = main_enable
			last_main_disable = main_disable
			
			reverse = controller.get_button(30)
			
			USVS.cmds['throttle'] = (-1 if reverse==1 else 1)*throttle
			USVS.cmds['steering'] = yaw
			
			for socket in sockets: await sync_cmds(socket)
			await asyncio.sleep(1/loop_rate)
	except asyncio.CancelledError:
		print('INFO: controller link terminated')
	except Exception as e:
		print(f'ERROR: controller error - {e}')

# --- Entry Point ---
async def main():
	port = 9100
	stop_event = asyncio.Event()

	async with websockets.serve(handler, '127.0.0.1', port):
		print(f'INFO: ground station server started on port {port}')

		transmit_task = None
		transmit_task = asyncio.create_task(transmit_loop(transmit_task, stop_event))
		controller_task = asyncio.create_task(controller_loop())
		console_task = asyncio.create_task(console_loop())

		try:
			_, _ = await asyncio.wait([console_task, asyncio.create_task(stop_event.wait())], return_when=asyncio.FIRST_COMPLETED)
		except asyncio.CancelledError:
			print(f'\fINFO: terminating')
		finally:
			transmit_task.cancel()
			controller_task.cancel()
			await controller_task
			results = await asyncio.gather(transmit_task, return_exceptions=True)
			results = list(filter(None, results))
			if results:
				print(f'INFO: termination completed with {len(results)} error(s) - {results}')
			else:
				print(f'INFO: termination complete')
			device.close()

if __name__ == '__main__': asyncio.run(main())