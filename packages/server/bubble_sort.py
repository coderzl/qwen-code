def bubble_sort(arr):
    """
    Sorts an array using the bubble sort algorithm.
    
    Args:
        arr: A list of comparable elements to be sorted
    
    Returns:
        The sorted list (modifies the original list in-place)
    """
    n = len(arr)
    
    # Traverse through all array elements
    for i in range(n):
        # Flag to optimize - if no swapping occurs, the array is already sorted
        swapped = False
        
        # Last i elements are already in place
        for j in range(0, n - i - 1):
            # Traverse the array from 0 to n-i-1
            # Swap if the element found is greater than the next element
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
                swapped = True
        
        # If no swapping occurred, the array is sorted
        if not swapped:
            break
    
    return arr


def main():
    # Test the bubble sort function with different inputs
    test_cases = [
        [64, 34, 25, 12, 22, 11, 90],
        [5, 2, 4, 6, 1, 3],
        [1],
        [],
        [3, 3, 3, 3],
        [9, 8, 7, 6, 5, 4, 3, 2, 1]
    ]
    
    print("Bubble Sort Algorithm Results:")
    print("=" * 40)
    
    for i, test_case in enumerate(test_cases, 1):
        original = test_case.copy()  # Keep a copy to show original
        sorted_arr = bubble_sort(test_case)
        print(f"Test Case {i}:")
        print(f"  Original:  {original}")
        print(f"  Sorted:    {sorted_arr}")
        print()


if __name__ == "__main__":
    main()