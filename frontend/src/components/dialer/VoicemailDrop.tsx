import React, { useState } from 'react';
import { Play, Square, Mail, Plus, Loader2 } from 'lucide-react';
import { useDialerStore } from '../../store/dialerStore';
import { toast } from 'sonner';

interface VoicemailTemplate {
  id: string;
  name: string;
  duration: number;
  url: string;
}

export default function VoicemailDrop() {
  const dropVoicemail = useDialerStore((state) => state.dropVoicemail);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioInstance, setAudioInstance] = useState<HTMLAudioElement | null>(null);
  const [droppingId, setDroppingId] = useState<string | null>(null);

  // Default pre-loaded voicemail templates for quick drop
  const [templates] = useState<VoicemailTemplate[]>([
    {
      id: 'template_1',
      name: 'FSBO Callback Request Greeting',
      duration: 15,
      url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', // Standard test audio
    },
    {
      id: 'template_2',
      name: 'Real Estate Cash Offer Pitch',
      duration: 22,
      url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    },
    {
      id: 'template_3',
      name: 'Standard Lead Voicemail Drop',
      duration: 18,
      url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    },
  ]);

  const handlePreview = (template: VoicemailTemplate) => {
    if (playingId === template.id) {
      if (audioInstance) {
        audioInstance.pause();
        audioInstance.currentTime = 0;
      }
      setPlayingId(null);
      setAudioInstance(null);
      return;
    }

    if (audioInstance) {
      audioInstance.pause();
    }

    const audio = new Audio(template.url);
    audio.play();
    setPlayingId(template.id);
    setAudioInstance(audio);

    audio.onended = () => {
      setPlayingId(null);
      setAudioInstance(null);
    };
  };

  const handleDrop = async (template: VoicemailTemplate) => {
    setDroppingId(template.id);
    try {
      await dropVoicemail(template.url);
      toast.success(`Dropped voicemail template: ${template.name}`);
    } catch (error) {
      toast.error('Failed to drop voicemail.');
    } finally {
      setDroppingId(null);
      if (audioInstance) {
        audioInstance.pause();
      }
    }
  };

  return (
    <div className="bg-zinc-900/40 border border-zinc-800 p-6 rounded-2xl space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-blue-500" />
          <h3 className="font-bold text-sm uppercase tracking-wider text-zinc-300">
            Voicemail Drop Templates
          </h3>
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-6 text-zinc-600 text-xs">
          No voicemail templates. Add them in Settings.
        </div>
      ) : (
        <div className="space-y-2.5">
          {templates.map((template) => (
            <div
              key={template.id}
              className="flex items-center justify-between p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors"
            >
              <div>
                <p className="text-xs font-bold text-zinc-200">{template.name}</p>
                <p className="text-[10px] text-zinc-500 font-medium mt-0.5">
                  Duration: {template.duration}s
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* Preview Button */}
                <button
                  type="button"
                  onClick={() => handlePreview(template)}
                  className="p-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:text-white rounded-lg text-zinc-400 transition-colors"
                >
                  {playingId === template.id ? (
                    <Square className="h-3.5 w-3.5 fill-current" />
                  ) : (
                    <Play className="h-3.5 w-3.5 fill-current" />
                  )}
                </button>

                {/* Drop Button */}
                <button
                  type="button"
                  onClick={() => handleDrop(template)}
                  disabled={droppingId !== null}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  {droppingId === template.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Mail className="h-3 w-3" />
                  )}
                  Drop
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
