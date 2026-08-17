// Standard 40-pin GPIO header layout, identical across all 40-pin Raspberry
// Pi models (Pi 2 B onward, 3, 4, 5, Zero/Zero W/Zero 2 W). Physical pin
// number -> function. Kept as fixed ground truth and handed to the AI in
// the prompt, rather than trusting it to recall the mapping correctly —
// getting a physical pin number wrong here means the user wires the wrong
// thing on real hardware.
const PHYSICAL_PIN_MAP = [
  { physical: 1, label: '3.3V power' },
  { physical: 2, label: '5V power' },
  { physical: 3, label: 'GPIO2 (I2C1 SDA)' },
  { physical: 4, label: '5V power' },
  { physical: 5, label: 'GPIO3 (I2C1 SCL)' },
  { physical: 6, label: 'Ground' },
  { physical: 7, label: 'GPIO4' },
  { physical: 8, label: 'GPIO14 (UART TXD)' },
  { physical: 9, label: 'Ground' },
  { physical: 10, label: 'GPIO15 (UART RXD)' },
  { physical: 11, label: 'GPIO17' },
  { physical: 12, label: 'GPIO18 (PWM)' },
  { physical: 13, label: 'GPIO27' },
  { physical: 14, label: 'Ground' },
  { physical: 15, label: 'GPIO22' },
  { physical: 16, label: 'GPIO23' },
  { physical: 17, label: '3.3V power' },
  { physical: 18, label: 'GPIO24' },
  { physical: 19, label: 'GPIO10 (SPI0 MOSI)' },
  { physical: 20, label: 'Ground' },
  { physical: 21, label: 'GPIO9 (SPI0 MISO)' },
  { physical: 22, label: 'GPIO25' },
  { physical: 23, label: 'GPIO11 (SPI0 SCLK)' },
  { physical: 24, label: 'GPIO8 (SPI0 CE0)' },
  { physical: 25, label: 'Ground' },
  { physical: 26, label: 'GPIO7 (SPI0 CE1)' },
  { physical: 27, label: 'GPIO0 (reserved, ID EEPROM)' },
  { physical: 28, label: 'GPIO1 (reserved, ID EEPROM)' },
  { physical: 29, label: 'GPIO5' },
  { physical: 30, label: 'Ground' },
  { physical: 31, label: 'GPIO6' },
  { physical: 32, label: 'GPIO12 (PWM)' },
  { physical: 33, label: 'GPIO13 (PWM)' },
  { physical: 34, label: 'Ground' },
  { physical: 35, label: 'GPIO19 (PWM)' },
  { physical: 36, label: 'GPIO16' },
  { physical: 37, label: 'GPIO26' },
  { physical: 38, label: 'GPIO20' },
  { physical: 39, label: 'Ground' },
  { physical: 40, label: 'GPIO21' },
];

function pinMapReference() {
  return PHYSICAL_PIN_MAP.map((p) => `physical pin ${p.physical} = ${p.label}`).join('\n');
}

module.exports = { PHYSICAL_PIN_MAP, pinMapReference };
