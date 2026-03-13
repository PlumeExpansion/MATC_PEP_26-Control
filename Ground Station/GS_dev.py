from digi.xbee.devices import XBeeDevice, RemoteXBeeDevice, XBeeMessage
from digi.xbee.models.address import XBee64BitAddress

PRINT_PORTS = False

if PRINT_PORTS:
	import serial.tools.list_ports as list_ports
	ports = list_ports.comports()
	com_list = [p.device for p in ports]
	print(f"Available ports: {com_list}")
	exit()

FREQ = 20

PORT = "COM8"
BAUD = 38400
MAC_USV_RN = "0013A20042839427"
device = XBeeDevice(PORT, BAUD)
device.open()

print('INFO: device connected')

remote_addr = XBee64BitAddress.from_hex_string(MAC_USV_RN)
remove_device = RemoteXBeeDevice(device, remote_addr)

def on_data_received(xbee_message: XBeeMessage):
	data = xbee_message.data.decode()
	sender = xbee_message.remote_device.get_64bit_addr()
	rssi_val = device.get_parameter("DB")
	rssi_dbm = -int.from_bytes(rssi_val, byteorder="big")
	print(f"INFO: received from: {sender}\nData: {data}\nRSSI: {rssi_dbm} dBm")

device.add_data_received_callback(on_data_received)

running = True

print('INFO: starting listening loop')
try:
	while running:
		command = input()
		if command == 'q':
			running = False
		else:
			print(f'INFO: sending: {command}')
			device.send_data_async(remove_device, command)

finally:
	device.close()
	print('INFO: terminated')