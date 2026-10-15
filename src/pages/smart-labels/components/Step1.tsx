import { useState } from 'react';
import { motion } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../../context/AuthContext';
import { supabase } from '../../../lib/supabase';

interface Step1Props {
  qrCount: number;
  setQrCount: (count: number) => void;
  onGenerate: (requestId: string) => void;
}

export const Step1 = ({ qrCount, setQrCount, onGenerate }: Step1Props) => {
  const isValid = qrCount > 0 && qrCount <= 100;

  const { currentUser } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  //const [progress, setProgress] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleGenerateClick = async () => {
    console.log('Generate button clicked with qrCount:', qrCount);
    setIsGenerating(true);
    
    const requestGuid = uuidv4();
    
    // Simulate generation progress
    const timer = setInterval(() => {
      /*setProgress(prev => {
        if (prev >= 100) {
          clearInterval(timer);
          return 100;
        }
        return prev + 10;
      });*/
    }, 300);

    try {
      const labelsToInsert = [];
      for (let i = 0; i < qrCount; i++) {
        labelsToInsert.push({
          dateCreated: new Date().toISOString(),
          guid: uuidv4(),
          isUsed: false,
          userId: currentUser?.uid,
          requestId: requestGuid
        });
      }
      const { error: insertErr } = await supabase.from("qrcodes").insert(labelsToInsert);
      if (insertErr) throw insertErr;
    } catch (error) {
      console.error('Error creating smartlabels:', error);
      clearInterval(timer);
      setIsGenerating(false);
      return;
    }

    clearInterval(timer);
    onGenerate(requestGuid);
  };

  return (
    <div className="relative">
      {isGenerating && (
        <div className="absolute inset-0 bg-white bg-opacity-80 flex items-center justify-center z-10 rounded-lg">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      )}
      {isModalOpen && (
  <div className="fixed inset-0 bg-gray-500 bg-opacity-50 flex items-center justify-center z-50">
    <motion.div
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -50, opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white p-6 rounded-lg shadow-md w-full max-w-md"
    >
      <h2 className="text-xl font-semibold mb-4">How many QR codes do you need?</h2>
      <input
        type="number"
        min="1"
        max="100"
        value={qrCount || ''}
        onChange={(e) => setQrCount(Number(e.target.value))}
        className="w-full p-2 border rounded mb-4"
        placeholder="Enter number (1-100)"
      />
      <button
            onClick={handleGenerateClick}
            className={`w-full py-2 px-4 rounded ${isValid ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-500'} flex items-center justify-center`}
            disabled={!isValid || isGenerating}
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
              </>
            ) : 'Generate QR Codes'}
          </button>
    </motion.div>
  </div>
)}

<button 
  className="fixed top-4 right-4 z-50 bg-blue-600 text-white py-2 px-4 rounded shadow-md hover:bg-blue-700 transition-colors"
  onClick={() => setIsModalOpen(true)}
>
  Generate QR Codes
</button>
    </div>
  );
};