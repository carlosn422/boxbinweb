import { motion } from 'framer-motion';

interface Step3Props {
  qrCount: number;
  onBack: () => void;
  requestId: string;
}

export const Step3 = ({ qrCount, onBack, requestId }: Step3Props) => {
  const isComplete = true;

  return (
    <motion.div
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -50, opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white p-6 rounded-lg shadow-md"
    >
      {isComplete && (
        <>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-6"
          >
            <div className="text-green-500 text-6xl mb-2">✓</div>
            <h2 className="text-xl font-semibold">Generation Complete!</h2>
            <div className="bg-gray-100 p-4 rounded-lg mt-4">
               <h3 className="font-medium text-lg mb-2">Label Generation Details</h3>
               <div className="grid grid-cols-2 gap-2">
                 <div>
                   <p className="text-sm text-gray-500">QR Codes Generated</p>
                   <p className="font-medium">{qrCount}</p>
                 </div>
                 <div>
                   <p className="text-sm text-gray-500">Date Generated</p>
                   <p className="font-medium">{new Date().toLocaleDateString()}</p>
                 </div>
                 <div className="col-span-2">
                   <p className="text-sm text-gray-500">Request ID</p>
                   <p className="font-medium">{requestId}</p>
                 </div>
               </div>
             </div>
          </motion.div>
          
          <div className="flex justify-center">
            <button
              onClick={onBack}
              className="py-2 px-6 bg-brand-600 text-white rounded"
            >
              Done
            </button>
          </div>
        </>
      )}
     </motion.div>
  );
};