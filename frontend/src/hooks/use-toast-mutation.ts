import { useMutation, useQueryClient, type UseMutationOptions, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface ToastMutationOptions<TData, TError extends Error, TVariables, TContext>
  extends UseMutationOptions<TData, TError, TVariables, TContext> {
  successMessage?: string;
  errorMessage?: string;
  invalidateKeys?: QueryKey[];
}

export function useToastMutation<
  TData = unknown,
  TError extends Error = Error,
  TVariables = void,
  TContext = unknown,
>(options: ToastMutationOptions<TData, TError, TVariables, TContext>) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { successMessage, errorMessage, invalidateKeys, onSuccess, onError, ...rest } = options;

  return useMutation({
    ...rest,
    onSuccess: (data, variables, onMutateResult, context) => {
      if (successMessage) toast.success(successMessage);
      if (invalidateKeys) {
        invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      }
      onSuccess?.(data, variables, onMutateResult, context);
    },
    onError: (error, variables, onMutateResult, context) => {
      toast.error(errorMessage || t('common.operationFailed'), {
        description: error.message,
      });
      onError?.(error, variables, onMutateResult, context);
    },
  });
}
