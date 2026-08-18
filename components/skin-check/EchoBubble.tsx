import { EchoMark } from "./EchoMark";

export function EchoBubble({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-2.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F7E3E3]">
        <EchoMark />
      </span>
      <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-[#F7E3E3] px-4 py-3">
        <p className="text-[1.0625rem] leading-snug text-[#1A1A1A]">{message}</p>
      </div>
    </div>
  );
}
