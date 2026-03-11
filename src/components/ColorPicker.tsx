import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Paintbrush } from "lucide-react";

const PRESET_COLORS = [
  // Reds
  "0 65% 52%", "0 55% 45%", "0 75% 60%",
  // Oranges
  "25 80% 52%", "38 85% 55%", "30 70% 50%",
  // Yellows
  "48 85% 50%", "55 70% 48%",
  // Greens
  "120 40% 42%", "145 45% 42%", "145 50% 48%", "168 35% 38%",
  // Blues
  "200 55% 50%", "215 55% 52%", "230 50% 55%", "240 40% 55%",
  // Purples
  "260 45% 55%", "280 45% 55%", "300 40% 50%", "320 40% 50%",
  // Neutrals
  "0 0% 40%", "0 0% 55%", "220 10% 46%",
];

interface ColorPickerProps {
  value: string; // HSL without hsl() wrapper, e.g. "215 55% 52%"
  onChange: (color: string) => void;
}

function parseHSL(hsl: string): { h: number; s: number; l: number } {
  const match = hsl.match(/([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  if (match) return { h: parseFloat(match[1]), s: parseFloat(match[2]), l: parseFloat(match[3]) };
  return { h: 215, s: 55, l: 52 };
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const parsed = parseHSL(value);
  const [hue, setHue] = useState(parsed.h);
  const [saturation, setSaturation] = useState(parsed.s);
  const [lightness, setLightness] = useState(parsed.l);

  const currentColor = `${Math.round(hue)} ${Math.round(saturation)}% ${Math.round(lightness)}%`;

  const applySliders = () => {
    onChange(currentColor);
  };

  const selectPreset = (color: string) => {
    const p = parseHSL(color);
    setHue(p.h);
    setSaturation(p.s);
    setLightness(p.l);
    onChange(color);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start gap-2">
          <div className="w-5 h-5 rounded border border-border" style={{ backgroundColor: `hsl(${value})` }} />
          <span className="text-sm text-muted-foreground">Pick color</span>
          <Paintbrush className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3" align="start">
        <Label className="text-xs font-medium">Presets</Label>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`w-6 h-6 rounded-md border transition-all hover:scale-110 ${
                value === color ? "ring-2 ring-primary ring-offset-1 ring-offset-background" : "border-border"
              }`}
              style={{ backgroundColor: `hsl(${color})` }}
              onClick={() => selectPreset(color)}
            />
          ))}
        </div>

        <div className="space-y-2 pt-1">
          <Label className="text-xs font-medium">Fine-tune</Label>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-5">H</span>
              <Slider
                value={[hue]}
                onValueChange={([v]) => setHue(v)}
                onValueCommit={applySliders}
                min={0} max={360} step={1}
                className="flex-1"
              />
              <span className="text-xs font-mono-numbers w-8 text-right">{Math.round(hue)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-5">S</span>
              <Slider
                value={[saturation]}
                onValueChange={([v]) => setSaturation(v)}
                onValueCommit={applySliders}
                min={0} max={100} step={1}
                className="flex-1"
              />
              <span className="text-xs font-mono-numbers w-8 text-right">{Math.round(saturation)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-5">L</span>
              <Slider
                value={[lightness]}
                onValueChange={([v]) => setLightness(v)}
                onValueCommit={applySliders}
                min={10} max={90} step={1}
                className="flex-1"
              />
              <span className="text-xs font-mono-numbers w-8 text-right">{Math.round(lightness)}%</span>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <div className="w-8 h-8 rounded-md border border-border" style={{ backgroundColor: `hsl(${currentColor})` }} />
            <Button size="sm" variant="secondary" className="flex-1" onClick={() => { applySliders(); setOpen(false); }}>
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Generate shaded HSL colors for subcategories based on their parent category color.
 * Each subcategory gets a lightness variation to differentiate while staying in the same hue family.
 */
export function getSubcategoryShade(parentColor: string, index: number, total: number): string {
  const parsed = parseHSL(parentColor);
  // Spread lightness from -15 to +15 around the parent lightness, clamped
  const range = Math.min(30, 60); // total lightness range to spread across
  const step = total > 1 ? range / (total - 1) : 0;
  const offset = total > 1 ? -range / 2 + step * index : 0;
  const newL = Math.max(25, Math.min(75, parsed.l + offset));
  // Slightly vary saturation too for better distinction
  const satOffset = total > 1 ? -8 + (16 / (total - 1)) * index : 0;
  const newS = Math.max(20, Math.min(90, parsed.s + satOffset));
  return `${parsed.h} ${Math.round(newS)}% ${Math.round(newL)}%`;
}
