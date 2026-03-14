export type WindowBusHandler = (data: unknown) => void
export type Unsubscribe = () => void

export interface WindowBus {
  emit(event: string, data: unknown): void
  on(event: string, handler: WindowBusHandler): Unsubscribe
}
