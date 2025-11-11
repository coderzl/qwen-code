def bubble_sort(arr):
    """
    Implementation of bubble sort algorithm
    """
    n = len(arr)
    # Traverse through all array elements
    for i in range(n):
        # Flag to optimize - if no swapping occurs, the array is sorted
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
    # Test the bubble sort with different arrays
    test_arrays = [
        [64, 34, 25, 12, 22, 11, 90],
        [5, 2, 4, 6, 1, 3],
        [1],
        [],
        [3, 3, 3, 3],
        [9, 8, 7, 6, 5, 4, 3, 2, 1]
    ]
    
    for i, arr in enumerate(test_arrays):
        print(f"Test {i + 1}:")
        print(f"Original array: {arr}")
        sorted_arr = bubble_sort(arr.copy())  # Use copy to preserve original
        print(f"Sorted array: {sorted_arr}")
        print()


if __name__ == "__main__":
    main()