'use client';

import { useTranslations } from 'next-intl';
import { Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface ConfidenceBadgeProps {
  confidence: number;
  model_used?: string;
}

export function ConfidenceBadge({ confidence, model_used }: ConfidenceBadgeProps) {
  const t = useTranslations('chat');
  const percentage = Math.round(confidence * 100);

  let level: 'high' | 'medium' | 'low';
  let Icon: typeof ShieldCheck;
  let colorClass: string;

  if (confidence >= 0.7) {
    level = 'high';
    Icon = ShieldCheck;
    colorClass = 'text-green-600 bg-green-50 border-green-200';
  } else if (confidence >= 0.4) {
    level = 'medium';
    Icon = Shield;
    colorClass = 'text-yellow-600 bg-yellow-50 border-yellow-200';
  } else {
    level = 'low';
    Icon = ShieldAlert;
    colorClass = 'text-red-600 bg-red-50 border-red-200';
  }

  const labelMap = { high: t('confidenceHigh'), medium: t('confidenceMedium'), low: t('confidenceLow') };

  // Short model display name
  const modelLabel = model_used?.replace('gemini-', '').replace('-preview', '') || undefined;

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
          colorClass
        )}
        title={`${labelMap[level]} (${percentage}%)`}
      >
        <Icon className="h-3 w-3" />
        <span>{percentage}%</span>
      </div>
      {modelLabel && (
        <span className="text-xs text-muted-foreground/60">{modelLabel}</span>
      )}
    </div>
  );
}
