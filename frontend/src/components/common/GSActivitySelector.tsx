import { useState } from 'react';
import useEscapeKey from '../../hooks/useEscapeKey';
import { GS_ACTIVITIES, CATEGORY_LABELS, getActivityById } from '../../data/gsActivities';
import type { GSActivity } from '../../data/gsActivities';

interface GSActivitySelectorProps {
  value: number | null;
  onChange: (activityId: number, activity: GSActivity) => void;
  filterByCategory?: string;
  disabled?: boolean;
  required?: boolean;
  label?: string;
  inputClassName?: string;
  compact?: boolean;
}

export default function GSActivitySelector({
  value,
  onChange,
  filterByCategory,
  disabled = false,
  required = false,
  label = 'Concepto (GS Activity)',
  inputClassName = '',
  compact = false,
}: GSActivitySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEscapeKey(() => setIsOpen(false), isOpen);

  const filteredActivities = filterByCategory
    ? GS_ACTIVITIES.filter(a => a.category === filterByCategory)
    : GS_ACTIVITIES;

  // Group activities by category
  const groupedActivities = filteredActivities.reduce((acc, activity) => {
    if (!acc[activity.category]) {
      acc[activity.category] = [];
    }
    acc[activity.category].push(activity);
    return acc;
  }, {} as Record<string, GSActivity[]>);

  const selectedActivity = value ? getActivityById(value) : null;

  const handleSelect = (activity: GSActivity) => {
    onChange(activity.id, activity);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {/* Selected value display */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full px-4 text-left border rounded-lg flex items-center justify-between ${
          compact ? 'min-h-[44px] py-2' : 'min-h-[74px] py-2'
        } ${
          disabled
            ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
            : 'bg-white hover:border-primary-500 cursor-pointer'
        } ${isOpen ? 'border-primary-500 ring-2 ring-primary-200' : 'border-gray-300'} ${inputClassName}`}
      >
        {selectedActivity ? (
          <div className={`flex flex-1 ${compact ? 'min-w-0 items-center' : 'flex-col'}`}>
            {compact ? (
              <span className="truncate text-sm font-medium text-gray-900">
                {selectedActivity.label}
              </span>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {selectedActivity.label}
                  </span>
                  {selectedActivity.proyectoRequerido && (
                    <span className="px-2 py-0.5 text-xs font-semibold rounded bg-orange-100 text-orange-700">
                      Requiere Proyecto
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500 truncate">
                  Categoria: {CATEGORY_LABELS[selectedActivity.category] || selectedActivity.category}
                </span>
              </>
            )}
          </div>
        ) : (
          <span className="text-gray-500">Selecciona un concepto...</span>
        )}
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'transform rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)}></div>

          {/* Dropdown menu */}
          <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-96 overflow-y-auto">
            {Object.entries(groupedActivities).map(([category, activities]) => (
              <div key={category} className="border-b border-gray-200 last:border-b-0">
                {/* Category header */}
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                  <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    {CATEGORY_LABELS[category] || category}
                  </h4>
                </div>

                {/* Activities in this category */}
                {activities.map((activity) => (
                  <button
                    key={activity.id}
                    type="button"
                    onClick={() => handleSelect(activity)}
                    className={`w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0 transition-colors ${
                      value === activity.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-sm font-medium text-gray-900">
                            {activity.label}
                          </span>
                          {value === activity.id && (
                            <svg className="w-4 h-4 text-primary-600" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </div>

                        {activity.code !== 'N/A' && (
                          <div className="flex items-center space-x-2">
                            <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-50 text-gray-600">
                              Código: {activity.code}
                            </span>
                          </div>
                        )}

                        {activity.proyectoRequerido && (
                          <div className="mt-1">
                            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-orange-100 text-orange-700">
                              ⚠️ Requiere Proyecto Obligatorio
                            </span>
                          </div>
                        )}

                        {activity.note && (
                          <p className="text-xs text-gray-500 mt-1 italic">
                            Nota: {activity.note}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
