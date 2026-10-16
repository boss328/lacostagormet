'use client';

import { useState } from 'react';
import { BoxTemplatePicker } from './BoxTemplatePicker';

const ignoreBusyChange = () => {};

export function SavedBoxTemplates() {
  const [dimensions, setDimensions] = useState({ lengthIn: '', widthIn: '', heightIn: '' });

  return (
    <BoxTemplatePicker
      mode="manage"
      dimensions={dimensions}
      disabled={false}
      onApply={setDimensions}
      onBusyChange={ignoreBusyChange}
    />
  );
}
