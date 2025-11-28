import React from 'react';
import InputNumber from 'rc-input-number';
import { ChevronUp, ChevronDown } from 'lucide-react';
import 'rc-input-number/assets/index.css';

export default function StyledNumberPicker({ value, onChange, mode, onModeChange }) {
  return (
    <div>
      <label className="block text-gray-700 font-semibold mb-2">
        How many options should each voter select?
      </label>
      <div className="flex items-center gap-3">
        <select
          value={mode}
          onChange={(e) => onModeChange(e.target.value)}
          className="px-5 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-700"
        >
          <option value="exactly">Exactly</option>
          <option value="minimum">At least</option>
          <option value="maximum">Up to</option>
        </select>
        <InputNumber
          value={value}
          onChange={onChange}
          min={1}
          max={20}
          step={1}
          controls
          upHandler={<ChevronUp size={16} />}
          downHandler={<ChevronDown size={16} />}
          style={{ width: '80px' }}
        />
        <span className="text-gray-600">options per vote</span>
      </div>
    </div>
  );
}