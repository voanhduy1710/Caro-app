/** A line in a room's chat. The room host stamps who sent it and when. */
export interface ChatMessage {
  id: string;
  /** Stable author id. Display names are not unique, so ownership is keyed on this. */
  senderId?: string;
  sender: string;
  text: string;
  image?: string;
  /** The sender's avatar as the room host saw it, for people no longer in the room. */
  senderAvatar?: string | null;
  timestamp: number;
  /** Locally generated notices (buzz) render as a centred system line. */
  system?: boolean;
}
