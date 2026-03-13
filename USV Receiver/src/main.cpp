// /*
#include <arduino.h>
#include <XBee.h>

#define BAUD 38400

XBeeAddress64 addrGS = XBeeAddress64(0x0013A200, 0x42839F27);

XBee xbee = XBee();
ZBRxResponse rx = ZBRxResponse();
AtCommandResponse at = AtCommandResponse();
TxStatusResponse txStatus = TxStatusResponse();
String inputBuffer = "";

void setup() {
	Serial.begin(0);
  
	// XBee Serial (Serial1 on Pins 0 and 1)
	Serial1.begin(BAUD);
	xbee.setSerial(Serial1);
	
	while (!Serial && millis() < 5000);

	Serial.println("INFO: XBee Receiver Ready...");
}

void sendRawAPI(XBeeAddress64 address, String message);

void loop() {
	xbee.readPacket();
	if (xbee.getResponse().isAvailable())
	{
		if (xbee.getResponse().getApiId() == ZB_RX_RESPONSE)
		{
			xbee.getResponse().getZBRxResponse(rx);

			Serial.print("INFO: received from: ");
			Serial.print(rx.getRemoteAddress64().getMsb(), HEX);
			Serial.println(rx.getRemoteAddress64().getLsb(), HEX);

			Serial.print("Data: ");
			for (int i=0; i<rx.getDataLength(); i++)
			{
				Serial.print((char)rx.getData()[i]);
			}
			Serial.println();
		}
		else if (xbee.getResponse().isError())
		{
			Serial.print("ERROR: Erro reading packet, code: ");
			Serial.println(xbee.getResponse().getErrorCode());
		}
		else if (xbee.getResponse().getApiId() != ZB_TX_STATUS_RESPONSE)
		{
			Serial.print("INFO: received response, id: ");
			Serial.println(xbee.getResponse().getApiId(), HEX);
		}
	}

	while (Serial.available())
	{
		char c = Serial.read();
		Serial.print(c);
		if (c == '\n')
		{
			if (inputBuffer.length() > 0)
			{
				sendRawAPI(addrGS, inputBuffer);
				inputBuffer = "";
			}
		}
		else
		{
			inputBuffer += c;
		}
	}
}

void sendRawAPI(XBeeAddress64 address, String message) {
  int payloadLen = message.length();
  
  // 1. Frame Header: Start Delimiter(1) + Length(2)
  // Length is everything from Frame Type to Checksum (excluding those)
  // For 0x10 frame: Type(1) + ID(1) + Addr(8) + 16BitAddr(2) + Radius(1) + Opt(1) + Payload(n)
  uint16_t frameLen = 14 + payloadLen;

  // 2. Construct the Frame Payload (for Checksum)
  uint8_t frame[15 + payloadLen]; 
  int pos = 0;

  frame[pos++] = 0x10;          // Frame Type (Transmit Request)
  frame[pos++] = 0x01;          // Frame ID (Set to 0x01 to get an ACK)
  
  // 64-bit Destination Address (MSB first)
  frame[pos++] = (uint8_t)(address.getMsb() >> 24);
  frame[pos++] = (uint8_t)(address.getMsb() >> 16);
  frame[pos++] = (uint8_t)(address.getMsb() >> 8);
  frame[pos++] = (uint8_t)(address.getMsb());
  frame[pos++] = (uint8_t)(address.getLsb() >> 24);
  frame[pos++] = (uint8_t)(address.getLsb() >> 16);
  frame[pos++] = (uint8_t)(address.getLsb() >> 8);
  frame[pos++] = (uint8_t)(address.getLsb());

  frame[pos++] = 0xFF;          // Reserved 16-bit address (0xFFFE)
  frame[pos++] = 0xFE;
  frame[pos++] = 0x00;          // Broadcast Radius (0 = max)
  frame[pos++] = 0x00;          // Transmit Options

  // Data Payload
  for (int i = 0; i < payloadLen; i++) {
    frame[pos++] = (uint8_t)message[i];
  }

  // 3. Calculate Checksum
  // To calculate: FF - (sum of all bytes after length and before checksum)
  long sum = 0;
  for (int i = 0; i < pos; i++) {
    sum += frame[i];
  }
  uint8_t checksum = 0xFF - (sum & 0xFF);

  // 4. Send the Packet
  Serial1.write(0x7E);              // Start Delimiter
  Serial1.write((frameLen >> 8) & 0xFF); // Length High
  Serial1.write(frameLen & 0xFF);        // Length Low
  Serial1.write(frame, pos);        // The actual frame
  Serial1.write(checksum);          // Checksum
  Serial1.flush();

  Serial.print("INFO sending: ");
  Serial.println(message);
}