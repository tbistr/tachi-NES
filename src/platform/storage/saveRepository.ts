export class SaveRepository {
  load(id: string) {
    const value = localStorage.getItem(`nes-save:${id}`);
    return value ? Uint8Array.from(atob(value), (c) => c.charCodeAt(0)) : undefined;
  }
  save(id: string, data: Uint8Array) {
    localStorage.setItem(`nes-save:${id}`, btoa(String.fromCharCode(...data)));
  }
}
