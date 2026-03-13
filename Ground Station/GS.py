import pygame
from digi.xbee.devices import XBeeDevice, RemoteXBeeDevice
from digi.xbee.models.address import XBee64BitAddress

FREQ = 20

PORT = "COM4"
BAUD = 38400
# MAC_USV_RN = "0013A20042839427"
MAC_USV_RN = "0013A20042839F27"
device = XBeeDevice(PORT, BAUD)
device.open()
# device.serial_port.rtscts = True # type: ignore # Enable Flow Control for the Waveshare board

remote_addr = XBee64BitAddress.from_hex_string(MAC_USV_RN)
remove_device = RemoteXBeeDevice(device, remote_addr)

pygame.init()
pygame.joystick.init()

if pygame.joystick.get_count() == 0:
	print("ERROR: no controller detected")
	exit()

controller = pygame.joystick.Joystick(0)
controller.init()

def on_data_received(xbee_message):
	data = xbee_message.data.decode()
	print(f"INFO: received RSSI: {xbee_message.rssi} dBm | Data: {data}")

device.add_data_received_callback(on_data_received)

clock = pygame.time.Clock()
running = True

try:
	while running:
		for event in pygame.event.get():
			if event.type == pygame.QUIT:
				running = False

		throttle = int((1-controller.get_axis(2))/2 * 256)
		steering = int(controller.get_axis(0)*256)

		command = f"T:{throttle:.2f},S:{steering:.2f}"
		
		device.send_data_async(remove_device, command)

		clock.tick(FREQ) 

finally:
	device.close()
	pygame.quit()
	print('INFO: terminated')