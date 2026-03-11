#include "arduino_freertos.h"

using namespace arduino;

void bootSerial()
{
	Serial.begin(0);
	while (!Serial && millis() < 2000) {}
	
	if (CrashReport)
	{
		Serial.print(CrashReport);
		Serial.println();
		Serial.flush();
	}
	
    Serial.println(PSTR("\r\nBooting FreeRTOS kernel " tskKERNEL_VERSION_NUMBER ". Built by gcc " __VERSION__ " (newlib " _NEWLIB_VERSION ") on " __DATE__ ". ***\r\n"));
}

void startScheduler()
{
	Serial.println(PSTR("Starting scheduler"));
    Serial.flush();
    vTaskStartScheduler();
}

static const int targetPin = 8;
void taskTogglePin(void *)
{
	pinMode(targetPin, OUTPUT);
	while (true)
	{
		digitalWrite(targetPin, HIGH);
		vTaskDelay(pdMS_TO_TICKS(1000));
		digitalWrite(targetPin, LOW);
		vTaskDelay(pdMS_TO_TICKS(1000));
	}
}

void setup()
{
	bootSerial();
	
	// Serial.println("Setup and loop task running with priority ");
	// Serial.println(uxTaskPriorityGet(NULL));

	xTaskCreate(taskTogglePin, "toggle pin", 128, NULL, 1, NULL);

	startScheduler();
}

void loop() {}