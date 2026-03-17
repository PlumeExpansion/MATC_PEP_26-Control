#include <arduino.h>
#include <VescUart.h>

#include "CommHandler.h"

#define BAUD_XBEE 38400
#define BAUD_ESC #
#define SERIAL_XBEE Serial1
#define SERIAL_ESC Serial2

#define PIN_AUX #
#define PIN_MAIN #
#define PIN_MAIN_ECHO #
#define PIN_COOLING #
#define PIN_BILGE #
#define PIN_LIN_ACT_FORW #
#define PIN_LIN_ACT_BACK #

CommHandler commHandler(SERIAL_XBEE);
VescUart ESC;

void failLoop(int failMode)
{
	while (true)
	{
		digitalWrite(LED_BUILTIN, HIGH);
		delay(1000);
		digitalWrite(LED_BUILTIN, LOW);
		delay(1000);
		for (int i=0; i<failMode; i++)
		{
			digitalWrite(LED_BUILTIN, HIGH);
			delay(200);
			digitalWrite(LED_BUILTIN, LOW);
			delay(200);
		}
	}
}

void setup()
{
	Serial.begin(0);
	pinMode(LED_BUILTIN, OUTPUT);
	pinMode(PIN_AUX, OUTPUT);
	pinMode(PIN_MAIN, OUTPUT);
	pinMode(PIN_MAIN_ECHO, INPUT_PULLUP);
	pinMode(PIN_COOLING, OUTPUT);
	pinMode(PIN_BILGE, OUTPUT);
	pinMode(PIN_COOLING, OUTPUT);
	pinMode(PIN_BILGE, OUTPUT);
	pinMode(PIN_LIN_ACT_FORW, OUTPUT);
	pinMode(PIN_LIN_ACT_BACK, OUTPUT);

	SERIAL_XBEE.begin(BAUD_XBEE);
	SERIAL_ESC.begin(BAUD_ESC);
	
	while (!Serial && millis() < 2000);
	Serial.printf("INFO [%lu]: serial initialized\n", millis());

	while (!SERIAL_XBEE)
	{
		if (millis() > 5000)
		{
			Serial.printf("ERROR [%lu]: XBee serial failed to initialize\n", millis());
			failLoop(0);
		}
	}
	Serial.printf("INFO [%lu]: XBee serial initialized\n", millis());

	while (!SERIAL_ESC)
	{
		if (millis() > 5000)
		{
			Serial.printf("ERROR [%lu]: ESC serial failed to initialize\n", millis());
			failLoop(1);
		}
	}
	Serial.printf("INFO [%lu]: ESC serial initialized\n", millis());
	ESC.setSerialPort(&SERIAL_ESC);
	if (ESC.getFWversion())
	{
		Serial.printf("INFO: [%lu]: ESC running firmware version \"%lu.%lu\"\n", millis(), ESC.fw_version.major, ESC.fw_version.minor);
	}
	else
	{
		Serial.printf("ERROR [%lu]: ESC failed to initialize\n", millis());
		failLoop(2);
	}
	
	Serial.printf("INFO [%lu]: USV initialized\n", millis());
}

uint32_t lastESC;
bool escLinkActive;
bool gsLinkActive;
bool controlledContactor;
void getData(uint32_t now)
{
	commHandler.mainEcho = digitalRead(PIN_MAIN_ECHO) == LOW;
	if (ESC.getVescValues())
	{
		lastESC = now;
		escLinkActive = true;
	}
}

void checkSafety(uint32_t now)
{
	if (gsLinkActive && now - commHandler.lastReceived > 1000)
	{
		gsLinkActive = false;
		commHandler.throttle = 0;
		commHandler.steering = 0;
		Serial.printf("WARNING [%lu]: GS link lost, nulling controls\n", now);
	}
	if (escLinkActive && now - lastESC > 1000)
	{
		escLinkActive = false;
		commHandler.mainOffStamp = now;
		commHandler.throttle = 0;
		commHandler.steering = 0;
		commHandler.mainEnable = false;
		Serial.printf("WARNING [%lu]: ESC link lost, cutting main power\n", now);
	}
	if (controlledContactor && !commHandler.mainEnable && commHandler.mainEcho && now - commHandler.mainOffStamp > 1000)
	{
		controlledContactor = false;
		commHandler.auxEnable = false;
		commHandler.throttle = 0;
		commHandler.steering = 0;
		Serial.printf("WARNING [%lu]: contactor still energized, cutting auxiliary power\n", now);
	}
}

void setControls(uint32_t now)
{
	if (gsLinkActive && escLinkActive && controlledContactor)
	{
		commHandler.mainEnable = commHandler.cmds.main;
		commHandler.auxEnable = commHandler.cmds.aux;
		commHandler.throttle = commHandler.cmds.throttle;
		commHandler.steering = commHandler.cmds.steering;
	}
	ESC.setDuty(commHandler.throttle);
	// TODO: add encoder
	if (commHandler.steering > 0)
	{
		analogWrite(PIN_LIN_ACT_FORW, (int)(commHandler.steering*256));
		digitalWrite(PIN_LIN_ACT_BACK, LOW);
	}
	else
	{
		analogWrite(PIN_LIN_ACT_BACK, (int)(-commHandler.steering*256));
		digitalWrite(PIN_LIN_ACT_FORW, LOW);
	}
	analogWrite(PIN_COOLING, (int)((float)commHandler.cmds.cooling*256/255));
	analogWrite(PIN_BILGE, (int)((float)commHandler.cmds.bilge*256/255));
	digitalWrite(PIN_MAIN, commHandler.mainEnable? HIGH : LOW);
	digitalWrite(PIN_AUX, commHandler.auxEnable? HIGH : LOW);
}

#define LOOP_RATE 100
uint32_t now;
uint32_t last;
void loop()
{
	now = millis();
	if (now-last < 1000/LOOP_RATE) return;
	last = now;
	commHandler.read(now, &controlledContactor);
	
	getData(now);
	checkSafety(now);
	setControls(now);

	commHandler.send(now, ESC, gsLinkActive, escLinkActive, controlledContactor);
}