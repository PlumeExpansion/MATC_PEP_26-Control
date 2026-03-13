#include <arduino.h>
#include <XBee.h>

#define BAUD 38400

XBeeAddress64 addrGS = XBeeAddress64(0x0013A200, 0x42839F27);

XBee xbee = XBee();
ZBRxResponse rx = ZBRxResponse();
ZBTxStatusResponse txStatus = ZBTxStatusResponse();
String inputBuffer = "";

void send(String inputBuffer);

void setup() {
	Serial.begin(0);
  
	// XBee Serial (Serial1 on Pins 0 and 1)
	Serial1.begin(BAUD);
	xbee.setSerial(Serial1);
	
	while (!Serial && millis() < 5000);
	Serial.println("INFO: XBee Receiver Ready...");
}


void loop() {
	xbee.readPacket();
	if (xbee.getResponse().isAvailable())
	{
		if (xbee.getResponse().getApiId() == ZB_RX_RESPONSE)
		{
			xbee.getResponse().getZBRxResponse(rx);

			Serial.print("INFO: Received from: ");
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
	}

	while (Serial.available())
	{
		char c = Serial.read();
		if (c == '\n')
		{
			if (inputBuffer.length() > 0)
			{
				send(inputBuffer);
				inputBuffer = "";
			}
		}
		else
		{
			inputBuffer += c;
		}
	}
}

void send(String msg)
{
	uint8_t payload[msg.length()];
	msg.getBytes(payload, msg.length()+1);

	ZBTxRequest tx = ZBTxRequest(addrGS, payload, msg.length());

	Serial.print("INFO: sending [");
	Serial.print(msg);
	Serial.print("] ... ");
	xbee.send(tx);
	Serial1.flush();

	if (xbee.readPacket(500))
	{
		if (xbee.getResponse().getApiId() == ZB_TX_STATUS_RESPONSE)
		{
			xbee.getResponse().getZBTxStatusResponse(txStatus);
			if (txStatus.getDeliveryStatus() == SUCCESS)
			{
				Serial.println("sent");
			}
			else
			{
				Serial.print("failed to send, status: ");
				Serial.println(txStatus.getDeliveryStatus(), HEX);
			}
		}
	}
	else if (xbee.getResponse().isError())
	{
		Serial.println("\nERROR: failed to read packet, code: ");
		Serial.print(xbee.getResponse().getErrorCode());
	}
	else
	{
		Serial.println("\nWARNING: no acknowledge received");
	}
}