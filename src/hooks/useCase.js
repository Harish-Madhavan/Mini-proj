import { useContext } from 'react';
import { CaseContext } from '../context/CaseContextObject';

export function useCase() {
  const context = useContext(CaseContext);
  if (!context) {
    throw new Error('useCase must be used within a CaseProvider');
  }
  return context;
}
