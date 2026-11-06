import { motion } from 'framer-motion';

interface Template {
  id: string;
  name: string;
}

interface Step2Props {
  templates: Template[];
  selected: string;
  setTemplate: (id: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export const Step2 = ({ templates, selected, setTemplate, onNext, onBack }: Step2Props) => {
  return (
    <motion.div
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -50, opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white p-6 rounded-lg shadow-md"
    >
      <h2 className="text-xl font-semibold mb-4">Select a template</h2>
      
      <div className="space-y-2 mb-6">
        {templates.map((template) => (
          <div 
            key={template.id} 
            className={`p-4 border rounded cursor-pointer ${selected === template.id ? 'border-brand-500 bg-brand-50' : 'border-gray-200'}`}
            onClick={() => setTemplate(template.id)}
          >
            {template.name}
          </div>
        ))}
      </div>
      
      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="flex-1 py-2 px-4 bg-gray-200 text-gray-700 rounded"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!selected}
          className={`flex-1 py-2 px-4 rounded ${selected ? 'bg-brand-600 text-white' : 'bg-gray-300 text-gray-500'}`}
        >
          Continue
        </button>
      </div>
    </motion.div>
  );
};