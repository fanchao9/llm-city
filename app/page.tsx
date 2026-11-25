import TownView from "./town-view";

export default function Home() {
  return (
    <div className="flex flex-1 bg-zinc-950 text-zinc-100">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">LLM City</h1>
        <TownView />
      </main>
    </div>
  );
}
