import { forwardRef } from "react";
import { SuggestionList, type SuggestionListRef } from "./SuggestionList";
import type { TagSuggestion } from "../../lib/note-tags";

export type HashtagSuggestionListRef = SuggestionListRef;

interface HashtagSuggestionListProps {
  items: TagSuggestion[];
  command: (item: TagSuggestion) => void;
}

export const HashtagSuggestionList = forwardRef<
  HashtagSuggestionListRef,
  HashtagSuggestionListProps
>(({ items, command }, ref) => (
  <SuggestionList
    ref={ref}
    items={items}
    command={command}
    itemKey={(item) => item.value}
    width="w-64"
    emptyText="No matching tags"
    renderItem={(item) => (
      <div className="flex flex-col min-w-0">
        <span className="text-sm leading-snug font-medium truncate">
          {item.label}
        </span>
        <span className="text-xs text-text-muted truncate mt-0.5">
          {item.description}
        </span>
      </div>
    )}
  />
));

HashtagSuggestionList.displayName = "HashtagSuggestionList";
