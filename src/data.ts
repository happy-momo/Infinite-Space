// 默认画布（default 页面）首次打开时的示例节点，仅作引导展示。
// Seed nodes shown when the default page is opened for the first time.
import { NodeData } from './types';

export const initialNodes: NodeData[] = [
  {
    id: '1',
    type: 'text',
    x: 250,
    y: 200,
    content: 'Welcome to your infinite space. 🌌\n\nDrag this card around. Scroll to pan, pinch to zoom. Free your thoughts from linear folders.',
    color: 'rgba(255, 255, 255, 0.9)',
    width: 320,
    zIndex: 1
  },
  {
    id: '2',
    type: 'image',
    x: 620,
    y: 120,
    content: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop',
    width: 400,
    zIndex: 2
  },
  {
    id: '3',
    type: 'text',
    x: 300,
    y: 460,
    content: 'Idea: Integrate an AI agent that automatically groups these nodes based on semantic similarity.',
    color: 'rgba(240, 249, 255, 0.9)',
    width: 280,
    zIndex: 3
  }
];
