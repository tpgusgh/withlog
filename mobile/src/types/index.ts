export type Member = { id: number; nickname: string; profileImage?: string | null; isOwner?: boolean };

export type Group = {
  id: number;
  name: string;
  inviteCode: string;
  inviteLink?: string;
  memberCount: number;
  maxMembers: number;
  isPublic?: boolean;
  ownerId?: number;
  members: Member[];
};

export type SlotSummary = {
  hour: string;
  closeAt: string;
  activeMembers: Member[];
  memberCount: number;
};

export type Post = {
  id: number;
  createdAt: string;
  dateLabel?: string;
  caption: string;
  likes: number;
  likedByMe?: boolean;
  comments: number;
  filter: string;
  thumbnail: string;
  mediaType?: 'image' | 'video';
  isMuted?: boolean;
  user: Member;
};

export type StoryItem = {
  userId: number;
  nickname: string;
  profileImage?: string | null;
  thumbnail?: string | null;
  groupId?: number;
  hasStory: boolean;
};

export type ChatMessage = {
  id: number;
  content: string;
  createdAt: string;
  messageType?: 'text' | 'quote' | 'heart' | 'image';
  mediaUrl?: string | null;
  mediaType?: 'image' | 'video' | null;
  reply?: {
    messageId?: number | null;
    content?: string | null;
    authorNickname?: string | null;
  } | null;
  quote?: {
    postId?: number | null;
    caption?: string | null;
    thumbnailUrl?: string | null;
    authorNickname?: string | null;
  } | null;
  user: Member;
};

export type CommentReaction = {
  emoji: string;
  count: number;
};

export type CommentItem = {
  id: number;
  content: string;
  createdAt: string;
  parentId?: number | null;
  replyCount: number;
  myReaction?: string | null;
  reactions: CommentReaction[];
  replies: CommentItem[];
  user: Member;
};
