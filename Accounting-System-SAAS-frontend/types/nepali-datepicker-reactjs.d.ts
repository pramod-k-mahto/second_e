declare module 'nepali-datepicker-reactjs' {
  import * as React from 'react';

  export type NepaliDatePickerOptions = {
    calenderLocale?: 'en' | 'ne';
    valueLocale?: 'en' | 'ne';
  };

  export type NepaliDatePickerProps = {
    value: string;
    onChange: (value: string) => void;
    inputClassName?: string;
    className?: string;
    options?: NepaliDatePickerOptions;
  };

  export const NepaliDatePicker: React.FC<NepaliDatePickerProps>;
}
