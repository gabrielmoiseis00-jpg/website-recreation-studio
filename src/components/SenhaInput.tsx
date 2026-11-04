import { Eye, EyeOff } from "lucide-react";
import { useState, type InputHTMLAttributes } from "react";

export function OlhoBtn({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-label={show ? "Ocultar senha" : "Mostrar senha"}
      className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground">
      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

export function SenhaInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="field-icon">
      <input {...props} type={show ? "text" : "password"} />
      <OlhoBtn show={show} onToggle={() => setShow(!show)} />
    </div>
  );
}
