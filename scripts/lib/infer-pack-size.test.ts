import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferPackSize } from './infer-pack-size';

test('packaging is extracted without confusing dose, bottle compatibility, or serving yield', () => {
  const cases: [string, string | null][] = [
    ['Coffee, 24 oz Bag (Case of 2)', '2 × 24 oz'],
    ['Syrup, 1L Bottle (Case of 6) - ~33 Drinks', '6 × 1 L'],
    ['Syrup, 750 mL PET (2-Pack, Pumps Included) - ~25 Drinks', '2 × 750 mL'],
    ['Variety Pack, 750 mL x 4 (Vanilla, Mocha)', '4 × 750 mL'],
    ['Milk, 32 oz Carton (Case of 12)', '12 × 32 oz'],
    ['Organic Earl Grey 100 Count Tea Sackets', '100 tea sachets'],
    ['Chai Single-Serve Packets (48-Count)', '48 packets'],
    ['Oatmeal Cup (12-Pack) - Just Add Hot Water', '12 cups'],
    ['Matcha, Bag (Case of 1)', '1 bag'],
    ['Nice Matcha, One 1.2 Lb Pouch', '1.2 lb'],
    ['Horchata, 25 lb Bulk Pail', '25 lb'],
    ['Smoothie, 3-Gallon Bag-in-Box - Dispenser', '3 gal bag-in-box'],
    ['Sauce Pump for 64 oz Bottles - Calibrated Portioning', '1 pump'],
    ['Pump, 15 mL (0.5 fl oz) - Calibrated Portioning', '1 pump'],
    ['Powder Mixing Tool for Chai', '1 mixing tool'],
    [
      "Gosh That's Good! Baristir - Powder Mixing Tool for Chai & Frappe Bases",
      '1 mixing tool',
    ],
    ['Mix - 20g Protein, 30 Drinks', null],
    ['New product without packaging', null],
  ];
  for (const [name, expected] of cases)
    assert.equal(inferPackSize(name), expected, name);
});
