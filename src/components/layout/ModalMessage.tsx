import React from 'react';
import { CheckCircle, XCircle, Info } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '../ui/alert-dialog';

export type ModalType = 'success' | 'error' | 'info';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: ModalType;
  message: string;
  title?: string;
}

const getModalConfig = (type: ModalType) => {
  switch (type) {
    case 'success':
      return {
        icon: CheckCircle,
        iconColor: 'text-green-500',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        buttonColor: 'bg-green-600 hover:bg-green-700',
        defaultTitle: 'Success'
      };
    case 'error':
      return {
        icon: XCircle,
        iconColor: 'text-red-500',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        buttonColor: 'bg-red-600 hover:bg-red-700',
        defaultTitle: 'Error'
      };
    case 'info':
      return {
        icon: Info,
        iconColor: 'text-blue-500',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        buttonColor: 'bg-blue-600 hover:bg-blue-700',
        defaultTitle: 'Information'
      };
    default:
      return {
        icon: Info,
        iconColor: 'text-blue-500',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        buttonColor: 'bg-blue-600 hover:bg-blue-700',
        defaultTitle: 'Information'
      };
  }
};

export const ModalMessage: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  type,
  message,
  title
}) => {
  const config = getModalConfig(type);
  const IconComponent = config.icon;

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className={`workspace-safe-dialog ${config.bgColor} ${config.borderColor} border-2`}>
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <IconComponent className={`h-6 w-6 ${config.iconColor}`} />
            <AlertDialogTitle className="text-lg font-semibold">
              {title || config.defaultTitle}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-gray-700 mt-2">
            {message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            onClick={onClose}
            className={`${config.buttonColor} text-white px-6 py-2 rounded-md transition-colors`}
          >
            OK
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
